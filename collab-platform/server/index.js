require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Import Models
const Message = require('./models/Message');
const User = require('./models/User');
const Room = require('./models/Room');
const Notification = require('./models/Notification');

// Express + Socket Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Global socket map for notifications
const userSocketMap = {};
app.set('socketio', io);
app.set('userSocketMap', userSocketMap);

// Middleware
app.use(cors());
app.use(express.json());
app.use(helmet());
app.use(compression());

// Database connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected...'))
  .catch(err => console.error('MongoDB Error:', err.message));

/* =======================================================================
   MAIN SOCKET LOGIC
   ======================================================================= */
io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  // Track WebRTC rooms
  socket.webrtcRooms = new Set();

  // Register user for notifications
  socket.on('register-user', (userId) => {
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  /* --------------------------- CHAT --------------------------- */
  socket.on('joinRoom', ({ roomId }) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined chat room ${roomId}`);
    socket.emit('joinedRoom', { roomId });
  });

  socket.on('chatMessage', async ({ roomId, senderId, text }) => {
    try {
      // Save message to MongoDB
      const message = new Message({ room: roomId, sender: senderId, text });
      await message.save();

      // Find sender
      const sender = await User.findById(senderId).select('username');
      const messageToSend = {
        ...message.toObject(),
        sender: { _id: sender._id, username: sender.username }
      };

      // Broadcast message to everyone in room
      io.to(roomId).emit('message', messageToSend);

      // Mention detection
      const mentionRegex = /@(\w+)/g;
      const mentions = text.match(mentionRegex);
      if (mentions) {
        const mentionedUsernames = new Set(mentions.map(m => m.substring(1)));
        for (const username of mentionedUsernames) {
          const mentionedUser = await User.findOne({ username });
          if (mentionedUser && mentionedUser._id.toString() !== senderId) {
            const room = await Room.findById(roomId);
            const notifMsg = `${sender.username} mentioned you in "${room.name}".`;
            const notification = new Notification({ user: mentionedUser._id, message: notifMsg });
            await notification.save();

            const recipientSocketId = userSocketMap[mentionedUser._id.toString()];
            if (recipientSocketId) {
              io.to(recipientSocketId).emit('new-notification', { message: notifMsg });
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ Error in chatMessage handler:', err);
    }
  });

  socket.on('typing', ({ roomId, userId }) => socket.to(roomId).emit('typing', { userId }));
  socket.on('stop-typing', ({ roomId, userId }) => socket.to(roomId).emit('stop-typing', { userId }));

  /* --------------------------- WEBRTC --------------------------- */
  socket.on('webrtc:join', ({ roomId, userId }) => {
    socket.join(`webrtc:${roomId}`);
    socket.webrtcRooms.add(roomId);
    console.log(`🎥 User ${userId} joined WebRTC room ${roomId}`);
    socket.to(`webrtc:${roomId}`).emit('webrtc:user-joined', { userId, socketId: socket.id });
  });

  socket.on('webrtc:signal', ({ roomId, targetSocketId, signal, fromUserId }) => {
    io.to(targetSocketId).emit('webrtc:signal', { signal, fromUserId, fromSocketId: socket.id });
  });

  socket.on('webrtc:leave', ({ roomId, userId }) => {
    socket.leave(`webrtc:${roomId}`);
    socket.webrtcRooms.delete(roomId);
    console.log(`👋 User ${userId} left WebRTC room ${roomId}`);
    socket.to(`webrtc:${roomId}`).emit('webrtc:user-left', { userId, socketId: socket.id });
  });

  /* --------------------------- DOC COLLABORATION --------------------------- */
  const docRooms = new Map(); // key: `${roomId}:${path}` → { content, version }

  socket.on('doc:join', ({ roomId, path }) => {
    const key = `${roomId}:${path}`;
    if (!docRooms.has(key)) docRooms.set(key, { content: '', version: 0 });
    socket.join(`doc:${key}`);
    const snapshot = docRooms.get(key);
    console.log(`✏️ User ${socket.id} joined doc ${key}`);
    socket.emit('doc:snapshot', { path, content: snapshot.content, version: snapshot.version });
  });

  socket.on('doc:update', ({ roomId, path, content, version }) => {
    const key = `${roomId}:${path}`;
    const data = docRooms.get(key) || { content: '', version: 0 };
    if (typeof version === 'number' && version >= data.version) {
      data.content = content;
      data.version = version + 1;
      docRooms.set(key, data);
      socket.to(`doc:${key}`).emit('doc:patch', { path, content: data.content, version: data.version });
    }
  });

  socket.on('doc:leave', ({ roomId, path }) => {
    const key = `${roomId}:${path}`;
    socket.leave(`doc:${key}`);
    console.log(`✏️ User ${socket.id} left doc ${key}`);
  });

  /* --------------------------- DISCONNECT --------------------------- */
  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
    const userId = Object.keys(userSocketMap).find(k => userSocketMap[k] === socket.id);
    if (userId) {
      delete userSocketMap[userId];
      console.log(`User ${userId} unregistered.`);
    }
  });
});

/* =======================================================================
   OPTIONAL NAMESPACED SOCKETS
   ======================================================================= */
const roomsNs = io.of('/rooms');
const webrtcNs = io.of('/webrtc');
const docsNs = io.of('/docs');

roomsNs.on('connection', (socket) => {
  socket.on('room:join', ({ roomId, user }) => {
    socket.join(roomId);
    roomsNs.to(roomId).emit('room:presence', { userId: user?._id, joined: true });
  });
});

webrtcNs.on('connection', (socket) => {
  socket.on('webrtc:join', ({ roomId }) => {
    socket.join(roomId);
    const peers = [...(webrtcNs.adapter.rooms.get(roomId) || [])];
    webrtcNs.to(socket.id).emit('webrtc:peers', { peers });
  });
  socket.on('webrtc:signal', ({ roomId, to, from, signal }) => {
    webrtcNs.to(to).emit('webrtc:signal', { from, signal, roomId });
  });
  socket.on('webrtc:leave', ({ roomId }) => {
    socket.leave(roomId);
    webrtcNs.to(roomId).emit('webrtc:left', { socketId: socket.id });
  });
});

docsNs.on('connection', (socket) => {
  socket.on('doc:join', (docId) => socket.join(docId));
  socket.on('doc:leave', (docId) => socket.leave(docId));
  socket.on('doc:update', (docId, update) => socket.to(docId).emit('doc:update', update));
});

/* =======================================================================
   EXPRESS ROUTES
   ======================================================================= */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/assessment', require('./routes/assessment'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/execute', require('./routes/execute'));
app.use('/api/files', require('./routes/files'));

/* =======================================================================
   START SERVER
   ======================================================================= */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
