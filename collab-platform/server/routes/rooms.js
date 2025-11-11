const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Room = require('../models/Room');
const Project = require('../models/Project');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));
const commits = require('../services/commits');
const { summarizeDiffs } = require('../services/groq');

router.get('/search', auth, async (req, res) => {
    try {
        const query = req.query.q || '';
        const rooms = await Room.find({
            isPublic: true,
            // owner: { $ne: req.user.id },   <-- DELETE THIS LINE
            // members: { $nin: [req.user.id] }, <-- DELETE THIS LINE
            name: new RegExp(query, 'i')
        }).populate('owner', 'username').populate('members', '_id'); // Also populate members now
        res.json(rooms);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});
// @route    GET api/rooms/myrooms
// @desc     Get all rooms for the logged-in user
router.get('/myrooms', auth, async (req, res) => {
    try {
        const rooms = await Room.find({ members: req.user.id }).populate('owner', ['username']);
        res.json(rooms);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    GET api/rooms/:id
// @desc     Get a single room by its ID
router.get('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id)
            .populate('owner', 'username')
            .populate('members', 'username')
            .populate('projects')
            .populate('joinRequests', 'username');

        if (!room) {
            return res.status(404).json({ msg: 'Room not found' });
        }
        if (!room.members.some(member => member._id.toString() === req.user.id)) {
            return res.status(401).json({ msg: 'Not authorized to view this room' });
        }
        res.json(room);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    GET api/rooms/:id/messages
// @desc     Get all messages for a room
router.get('/:id/messages', auth, async (req, res) => {
    try {
        const messages = await Message.find({ room: req.params.id })
            .populate('sender', ['username'])
            .sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    POST api/rooms
// @desc     Create a new room
router.post('/', auth, async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ msg: 'Please provide a room name' });
    }
    try {
        const newRoom = new Room({
            name,
            description,
            owner: req.user.id,
            members: [req.user.id]
        });
        const room = await newRoom.save();
        res.json(room);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    POST api/rooms/:id/request-join
// @desc     Request to join a room
router.post('/:id/request-join', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) {
            return res.status(404).json({ msg: "Room not found." });
        }

        // Add user to the join requests array
        await Room.findByIdAndUpdate(req.params.id, { $addToSet: { joinRequests: req.user.id } });

        // --- THIS IS THE FIX ---
        const requestingUser = await User.findById(req.user.id).select('username');
        const ownerId = room.owner;
        const message = `${requestingUser.username} has requested to join your room "${room.name}".`;

        // Create a notification in the database for the owner
        const notification = new Notification({ user: ownerId, message });
        await notification.save();

        // Send a real-time notification to the owner if they are online
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        const ownerSocketId = userSocketMap[ownerId.toString()];

        if (ownerSocketId) {
            io.to(ownerSocketId).emit('new-notification', { message });
        }
        // --- END OF FIX ---

        res.json({ msg: 'Request sent' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    POST api/rooms/:id/handle-request
// @route    POST api/rooms/:id/handle-request
router.post('/:id/handle-request', auth, async (req, res) => {
    const { requestUserId, action } = req.body;
    try {
        let room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }
        
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        const applicant = await User.findById(requestUserId);
        if (!applicant) return res.status(404).json({ msg: 'Requesting user not found.' });

        const existingMembers = [...room.members]; // Store old members before modification
        
        // Always remove the request from the array
        room.joinRequests.pull(requestUserId);

        if (action === 'approve') {
            room.members.addToSet(requestUserId);
            
            const approvalMessage = `You have been accepted into the room: "${room.name}"`;
            const notification = new Notification({ user: requestUserId, message: approvalMessage });
            await notification.save();
            const recipientSocketId = userSocketMap[requestUserId];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('new-notification', { message: approvalMessage });
                io.to(recipientSocketId).emit('dashboard-update', { userId: requestUserId });
            }

            // Notify all EXISTING members that someone new joined
            existingMembers.forEach(async (memberId) => {
                const message = `${applicant.username} has joined the room "${room.name}".`;
                const memberNotification = new Notification({ user: memberId, message });
                await memberNotification.save();
                const memberSocketId = userSocketMap[memberId.toString()];
                if (memberSocketId) {
                    io.to(memberSocketId).emit('new-notification', { message });
                }
            });

        } else { // Action is 'deny'
            const denialMessage = `Your request to join the room "${room.name}" was denied.`;
            const notification = new Notification({ user: requestUserId, message: denialMessage });
            await notification.save();
            const recipientSocketId = userSocketMap[requestUserId];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('new-notification', { message: denialMessage });
            }
        }
        
        await room.save();
        
        const updatedRoom = await Room.findById(req.params.id).populate('joinRequests', 'username').populate('members', 'username');
        io.to(req.app.get('userSocketMap')[req.user.id]).emit('room-update'); // Update the owner's UI
            
        res.json(updatedRoom);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});
// @route    PUT api/rooms/:id
// @desc     Update a room
// @access   Private (Owner only)
router.put('/:id', auth, async (req, res) => {
    const { name, description } = req.body;
    try {
        let room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }
        room = await Room.findByIdAndUpdate(req.params.id, { $set: { name, description } }, { new: true });
        res.json(room);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    DELETE api/rooms/:id
// @desc     Delete a room
// @access   Private (Owner only)
router.delete('/:id', auth, async (req, res) => {
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        await Project.deleteMany({ room: req.params.id });
        await Message.deleteMany({ room: req.params.id });
        await room.deleteOne();

        res.json({ msg: 'Room and all associated data removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// --- Commit Request and Approval Flow ---
async function generateCommitSummary(diffText) {
    try {
        const response = await fetch('https://api.groq.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-70b",
                messages: [
                    { role: "system", content: "You are an expert AI that summarizes code changes for commit messages." },
                    { role: "user", content: `Summarize these code changes briefly:\n\n${diffText}` }
                ]
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "No summary generated.";
    } catch (e) {
        return "No summary generated.";
    }
}

// Request a commit (sends to admin for approval) - new structure supports multiple files
router.post('/:id/commit', auth, async (req, res) => {
    const { files, projectId } = req.body; // files: [{path, oldContent, newContent}]
    try {
        const room = await Room.findById(req.params.id).populate('owner', 'username');
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (!room.members.some(m => m.toString() === req.user.id)) {
            return res.status(401).json({ msg: 'Not a room member' });
        }

        const reqObj = commits.createRequest({ roomId: room.id, authorId: req.user.id, files });
        const flatDiff = reqObj.diffs.map(d => `${d.path}\n${d.diff.map(p => (p.added ? '+ ' : p.removed ? '- ' : '  ') + p.value).join('')}`).join('\n\n');
        const summary = await summarizeDiffs(flatDiff.slice(0, 12000));
        commits.setSummary(reqObj.id, summary);
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');

        const payload = { requestId: reqObj.id, roomId: room.id, requesterId: req.user.id, projectId, summary, files: files.map(f => ({ path: f.path })) };

        // Notify admin
        const ownerSocketId = userSocketMap[room.owner._id.toString()];
        if (ownerSocketId) {
            io.of('/rooms').to(ownerSocketId).emit('commit:request', payload);
        }

        // Persist a notification for admin
        const note = new Notification({ user: room.owner._id, message: `Commit approval requested in "${room.name}".` });
        await note.save();

        res.json({ ok: true, summary });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Admin approves/rejects a commit
router.post('/:id/approve', auth, async (req, res) => {
    const { requesterId, approved, requestId, projectId } = req.body;
    try {
        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');

        // For now, we just drop or accept without writing to repo (wiring can be added to File model)
        const reqObj = commits.get(requestId);
        if (approved) commits.take(requestId);

        const requesterSocketId = userSocketMap[requesterId];
        if (requesterSocketId) {
            io.of('/rooms').to(requesterSocketId).emit(approved ? 'commit:approved' : 'commit:rejected', {
                roomId: room.id,
                projectId,
                requestId
            });
        }

        const noteMsg = approved ? `Admin approved your commit in "${room.name}".` : `Admin rejected your commit in "${room.name}".`;
        const note = new Notification({ user: requesterId, message: noteMsg });
        await note.save();

        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;