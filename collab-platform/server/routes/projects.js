const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Project = require('../models/Project');
const Room = require('../models/Room');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Middleware to check if the user is the owner of the room associated with the project
const isRoomOwner = async (req, res, next) => {
    try {
        const project = await Project.findById(req.params.id).populate('room');
        if (!project) return res.status(404).json({ msg: 'Project not found' });

        // Also populate room members to use in routes
        await project.room.populate('members');
        
        if (project.room.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }
        req.project = project;
        next();
    } catch (err) {
        console.error("isRoomOwner middleware error:", err);
        res.status(500).send('Server Error');
    }
};

// @route    POST api/projects
router.post('/', auth, async (req, res) => {
    const { name, description, projectType, roomId } = req.body;
    try {
        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ msg: 'Room not found' });
        if (room.owner.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }
        
        const newProject = new Project({ name, description, projectType, room: roomId, members: [req.user.id] });
        const project = await newProject.save();
        
        room.projects.push(project.id);
        await room.save();
        await room.populate('members'); // Make sure members are populated

        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        const sender = await User.findById(req.user.id).select('username');

        // Notify all OTHER members of the room
        room.members.forEach(async (member) => {
            if (member._id.toString() !== req.user.id) {
                const message = `${sender.username} created a new project "${project.name}" in your room "${room.name}".`;
                const notification = new Notification({ user: member._id, message });
                await notification.save();

                const recipientSocketId = userSocketMap[member._id.toString()];
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('new-notification', { message });
                }
            }
        });
        io.to(roomId).emit('room-update');

        res.json(project);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    GET api/projects/:id
// @desc     Get a project by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const project = await Project.findById(req.params.id).populate('members', 'username');
        if (!project) {
            return res.status(404).json({ msg: 'Project not found' });
        }
        res.json(project);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    PUT api/projects/:id
// @desc     Update a project's name and description
router.put('/:id', [auth, isRoomOwner], async (req, res) => {
    const { name, description } = req.body;
    try {
        const updatedProject = await Project.findByIdAndUpdate(req.params.id, { $set: { name, description } }, { new: true });
        
        const io = req.app.get('socketio');
        io.to(req.project.room._id.toString()).emit('room-update');

        res.json(updatedProject);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    DELETE api/projects/:id
router.delete('/:id', [auth, isRoomOwner], async (req, res) => {
    try {
        const projectName = req.project.name;
        const roomObject = req.project.room;

        await Room.findByIdAndUpdate(roomObject._id, { $pull: { projects: req.params.id } });
        await req.project.deleteOne();
        
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        const sender = await User.findById(req.user.id).select('username');

        roomObject.members.forEach(async (member) => {
            if (member._id.toString() !== req.user.id) {
                const message = `${sender.username} deleted the project "${projectName}" from your room "${roomObject.name}".`;
                const notification = new Notification({ user: member._id, message });
                await notification.save();
                const recipientSocketId = userSocketMap[member._id.toString()];
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('new-notification', { message });
                }
            }
        });
        io.to(roomObject._id.toString()).emit('room-update');
        
        res.json({ msg: 'Project removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    POST api/projects/:id/members
// @desc     Add a member to a project
router.post('/:id/members', [auth, isRoomOwner], async (req, res) => {
    try {
        const { userId } = req.body;
        const updatedProject = await Project.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { members: userId } },
            { new: true }
        ).populate('members', 'username');

        // --- Notification Logic ---
        const io = req.app.get('socketio');
        const userSocketMap = req.app.get('userSocketMap');
        const sender = await User.findById(req.user.id).select('username');
        const message = `${sender.username} added you to the project "${updatedProject.name}".`;
        
        const notification = new Notification({ user: userId, message });
        await notification.save();
        const recipientSocketId = userSocketMap[userId];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('new-notification', { message });
        }
        // --- End Notification Logic ---

        res.json(updatedProject.members);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    DELETE api/projects/:id/members/:memberId
// @desc     Remove a member from a project
router.delete('/:id/members/:memberId', [auth, isRoomOwner], async (req, res) => {
    try {
        const updatedProject = await Project.findByIdAndUpdate(
            req.params.id,
            { $pull: { members: req.params.memberId } },
            { new: true }
        ).populate('members', 'username');
        res.json(updatedProject.members);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;