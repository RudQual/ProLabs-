// src/components/chat/Chat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../../socket';

const Chat = ({ messages, onSendMessage, currentUser, roomId }) => {
  const [text, setText] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const messagesEndRef = useRef(null);

  // Auto scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  // Wait until user info is ready
  if (!currentUser || !currentUser._id) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading chat...
      </div>
    );
  }

  // Typing indicator logic
  useEffect(() => {
    const handleTyping = ({ userId }) => {
      if (userId === currentUser._id) return;
      setTypingUsers(prev => new Set(prev).add(userId));
    };

    const handleStopTyping = ({ userId }) => {
      setTypingUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    socket.on('typing', handleTyping);
    socket.on('stop-typing', handleStopTyping);

    return () => {
      socket.off('typing', handleTyping);
      socket.off('stop-typing', handleStopTyping);
    };
  }, [currentUser._id]);

  // Send message
  const handleSubmit = e => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    // Send to backend
    onSendMessage(trimmed);

    // Optimistic local append so it shows instantly
    const localMsg = {
      _id: `temp-${Date.now()}`,
      sender: { _id: currentUser._id, username: currentUser.username || 'You' },
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    socket.emit('chatMessage', { roomId, senderId: currentUser._id, text: trimmed });
    setText('');
    socket.emit('stop-typing', { roomId, userId: currentUser._id });

    // Add local message immediately if not handled upstream
    if (typeof onSendMessage !== 'function') {
      messages.push(localMsg);
    }
  };

  // Input change handler
  const handleChange = e => {
    const value = e.target.value;
    setText(value);
    if (value.trim()) {
      socket.emit('typing', { roomId, userId: currentUser._id });
    } else {
      socket.emit('stop-typing', { roomId, userId: currentUser._id });
    }
  };

  // Render UI
  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-4">No messages yet.</div>
        )}

        {messages.map((msg, i) => {
          const senderId = msg.sender?._id || msg.senderId || msg.userId;
          const senderName =
            msg.sender?.username ||
            (senderId === currentUser._id ? 'You' : 'User');
          const isMine = senderId === currentUser._id;

          return (
            <div
              key={msg._id || i}
              className={`flex flex-col ${
                isMine ? 'items-end text-right' : 'items-start text-left'
              }`}
            >
              <div
                className={`text-sm mb-1 ${
                  isMine ? 'text-indigo-400' : 'text-emerald-400'
                }`}
              >
                {senderName}
              </div>
              <div
                className={`max-w-xs px-3 py-2 rounded-2xl break-words ${
                  isMine
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-100'
                }`}
              >
                {msg.text}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {msg.createdAt
                  ? new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''}
              </div>
            </div>
          );
        })}

        {typingUsers.size > 0 && (
          <div className="text-sm text-slate-400 italic">Someone is typing…</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input field */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-3 border-t border-slate-800 bg-slate-900"
      >
        <input
          type="text"
          value={text}
          onChange={handleChange}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 rounded-lg bg-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
