import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import axios from 'axios';
import { socket, joinWebRTC, leaveWebRTC, signalWebRTC } from '../socket';
import VideoGrid from '../components/rooms/VideoGrid';
import Chat from '../components/chat/Chat';
import IDEPanel from '../components/ide/IDEPanel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiMonitor,
  FiMessageSquare, FiCode, FiPhoneOff, FiMaximize2, FiMinimize2
} from 'react-icons/fi';

export default function RoomPage() {
  const { roomId } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(true);
  const [activePane, setActivePane] = useState('video');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`/api/rooms/${roomId}`);
        setRoom(data);
      } catch (err) {
        console.error('Failed to load room:', err);
        navigate('/dashboard');
      }
    })();
  }, [roomId, navigate]);

  useEffect(() => {
    if (!user) return;
    if (!socket.connected) socket.connect();
    socket.emit('register-user', user._id);
    joinWebRTC(roomId, user._id);
    const onMsg = msg => setMessages(prev => [...prev, msg]);
    socket.on('message', onMsg);
    return () => {
      leaveWebRTC(roomId, user._id);
      socket.off('message', onMsg);
    };
  }, [user, roomId]);

  const projectId = room?.project?._id || room?.projects?.[0]?._id || null;

  return (
    <div className={`h-screen w-full flex flex-col bg-slate-950 text-slate-100 ${fullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <header className="flex justify-between items-center px-6 h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="font-semibold">{room?.name || 'Room'}</div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <button onClick={() => setFullscreen(f => !f)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700">
            {fullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
          </button>
          <span>{room?.members?.length || 1} online</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 transition-all duration-200 overflow-hidden`}>
          {activePane === 'video' ? (
            <VideoGrid
              roomId={roomId}
              micOn={micOn}
              camOn={camOn}
              sharing={sharing}
              onSignal={payload => signalWebRTC({ roomId, ...payload })}
            />
          ) : projectId ? (
            <IDEPanel roomId={roomId} projectId={projectId} currentUser={user} />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              ⚠️ No project linked to this room.
            </div>
          )}
        </div>

        <AnimatePresence>
          {showChat && (
            <motion.aside
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-1/4 border-l border-slate-800 bg-slate-900 flex flex-col"
            >
              <Chat roomId={roomId} currentUser={user} messages={messages} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <footer className="h-16 border-t border-slate-800 bg-slate-900 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setMicOn(v => !v)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700">
            {micOn ? <FiMic /> : <FiMicOff />}
          </button>
          <button onClick={() => setCamOn(v => !v)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700">
            {camOn ? <FiVideo /> : <FiVideoOff />}
          </button>
          <button onClick={() => setSharing(s => !s)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700">
            <FiMonitor />
          </button>
          <button onClick={() => setShowChat(s => !s)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700">
            <FiMessageSquare />
          </button>
          <div className="ml-2 flex rounded-lg overflow-hidden border border-slate-700">
            <button onClick={() => setActivePane('video')} className={`px-3 py-2 ${activePane === 'video' ? 'bg-slate-800 text-indigo-400' : 'bg-slate-900 hover:bg-slate-800'}`}>
              Video
            </button>
            <button onClick={() => setActivePane('editor')} className={`px-3 py-2 ${activePane === 'editor' ? 'bg-slate-800 text-indigo-400' : 'bg-slate-900 hover:bg-slate-800'}`}>
              <FiCode className="inline mr-1" /> Editor
            </button>
          </div>
        </div>
        <button onClick={() => navigate('/dashboard')} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 font-semibold flex items-center gap-2">
          <FiPhoneOff /> Leave
        </button>
      </footer>
    </div>
  );
}
