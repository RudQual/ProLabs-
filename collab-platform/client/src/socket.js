import { io } from 'socket.io-client';

// Use your server URL
const URL = 'http://localhost:5000';

export const socket = io(URL, {
    autoConnect: false // We will connect manually when the user is logged in
});
export const joinWebRTC = (roomId, userId) => socket.emit('webrtc:join', { roomId, userId });
export const leaveWebRTC = (roomId, userId) => socket.emit('webrtc:leave', { roomId, userId });
export const signalWebRTC = (payload) => socket.emit('webrtc:signal', payload);

export const joinDoc = (roomId, path) => socket.emit('doc:join', { roomId, path });
export const leaveDoc = (roomId, path) => socket.emit('doc:leave', { roomId, path });
export const updateDoc = (payload) => socket.emit('doc:update', payload);
