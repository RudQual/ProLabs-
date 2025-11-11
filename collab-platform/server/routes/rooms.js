const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Room = require('../models/Room');
const Project = require('../models/Project');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');

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

module.exports = router;