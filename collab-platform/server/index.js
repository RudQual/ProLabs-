require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// Import Models
const Message = require('./models/Message');
const User = require('./models/User');
const Room = require('./models/Room'); // Needed for chat mention logic

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

// This object maps a userId to their current socket.id for direct messaging
const userSocketMap = {};

// Make io and the userSocketMap accessible to all API routes
app.set('socketio', io);
app.set('userSocketMap', userSocketMap);

// Middleware
app.use(cors());
app.use(express.json());

// DB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => console.error(err.message));

// Real-time Logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Register user's socket for direct notifications
    socket.on('register-user', (userId) => {
        userSocketMap[userId] = socket.id;
        console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    // Chat Logic
    socket.on('joinRoom', ({ roomId }) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined chat room ${roomId}`);
    });

    socket.on('chatMessage', async ({ roomId, senderId, text }) => {
        try {
            const message = new Message({ room: roomId, sender: senderId, text });
            await message.save();
            const sender = await User.findById(senderId).select('username');
            const messageToSend = {
                ...message.toObject(),
                sender: { _id: sender._id, username: sender.username }
            };
            io.to(roomId).emit('message', messageToSend);

            // Mention Logic
            const mentionRegex = /@(\w+)/g;
            const mentions = text.match(mentionRegex);
            if (mentions) {
                const mentionedUsernames = new Set(mentions.map(mention => mention.substring(1)));
                for (const username of mentionedUsernames) {
                    const mentionedUser = await User.findOne({ username: username });
                    if (mentionedUser && mentionedUser._id.toString() !== senderId) {
                        const room = await Room.findById(roomId);
                        const message = `${sender.username} mentioned you in the room "${room.name}".`;
                        const notification = new Notification({ user: mentionedUser._id, message });
                        await notification.save();
                        const recipientSocketId = userSocketMap[mentionedUser._id.toString()];
                        if (recipientSocketId) {
                            io.to(recipientSocketId).emit('new-notification', { message });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error handling chat message:', error);
        }
    });
    
    // Document Sync Logic for IDE
    socket.on('join-doc', (docId) => {
        socket.join(docId);
        console.log(`User ${socket.id} joined document room ${docId}`);
    });
    socket.on('leave-doc', (docId) => {
        socket.leave(docId);
        console.log(`User ${socket.id} left document room ${docId}`);
    });
    socket.on('doc-update', (docId, update) => {
        socket.to(docId).emit('doc-update', update);
    });

    // Disconnect Logic
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
        if (userId) {
            delete userSocketMap[userId];
            console.log(`User ${userId} unregistered.`);
        }
    });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/assessment', require('./routes/assessment'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/execute', require('./routes/execute'));
app.use('/api/files', require('./routes/files'));


// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));