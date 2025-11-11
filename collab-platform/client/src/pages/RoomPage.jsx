import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { socket } from '../socket';
import AuthContext from '../context/AuthContext';
import Chat from '../components/chat/Chat';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import EditProjectModal from '../components/projects/EditProjectModal';
import ManageMembersModal from '../components/projects/ManageMembersModal';

const RoomPage = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user } = useContext(AuthContext);

    const [room, setRoom] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateProjectModalOpen, setCreateProjectModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [managingMembers, setManagingMembers] = useState(null);

    const fetchRoomData = useCallback(async () => {
        try {
            const roomRes = await axios.get(`/api/rooms/${roomId}`);
            setRoom(roomRes.data);
            const messagesRes = await axios.get(`/api/rooms/${roomId}/messages`);
            setMessages(messagesRes.data);
        } catch (err) { 
            console.error(err);
            if (err.response?.status === 404) navigate('/dashboard');
        } 
        finally { setLoading(false); }
    }, [roomId, navigate]);

    useEffect(() => {
        fetchRoomData();
        socket.emit('joinRoom', { roomId });
        socket.on('message', newMessage => setMessages(prev => [...prev, newMessage]));
        socket.on('room-update', fetchRoomData);

        return () => {
            socket.off('message');
            socket.off('room-update');
        };
    }, [roomId, fetchRoomData]);
    
    const handleSendMessage = (text) => {
        if (user) socket.emit('chatMessage', { roomId, senderId: user._id, text });
    };
    
    const handleProjectCreated = () => fetchRoomData();

    const handleDeleteRoom = async () => {
        if (window.confirm('Are you sure you want to delete this room and all of its associated projects and chats? This action is permanent.')) {
            try {
                await axios.delete(`/api/rooms/${roomId}`);
                navigate('/dashboard');
            } catch (err) {
                console.error("Failed to delete room:", err);
                alert('Failed to delete room.');
            }
        }
    };

    const handleDeleteProject = async (projectId) => {
        if (window.confirm('Are you sure you want to delete this project?')) {
            try {
                await axios.delete(`/api/projects/${projectId}`);
                fetchRoomData();
            } catch (err) {
                console.error("Failed to delete project:", err);
                alert('Failed to delete project.');
            }
        }
    };

    const handleJoinRequest = async (requestUserId, action) => {
        try {
            const res = await axios.post(`/api/rooms/${roomId}/handle-request`, { requestUserId, action });
            setRoom(res.data);
        } catch (err) {
            console.error("Failed to handle join request:", err);
            alert('Failed to handle request.');
        }
    };

    if (loading || !user) return <div className="container">Loading room...</div>;
    if (!room) return <div className="container">Room not found or you do not have access.</div>;

    const isOwner = user._id === room.owner._id;

    return (
        <div className="container">
            {isCreateProjectModalOpen && <CreateProjectModal roomId={roomId} onClose={() => setCreateProjectModalOpen(false)} onProjectCreated={handleProjectCreated}/>}
            {editingProject && <EditProjectModal project={editingProject} onClose={() => setEditingProject(null)} onProjectUpdated={fetchRoomData} />}
            {managingMembers && <ManageMembersModal project={managingMembers} roomMembers={room.members} onClose={() => setManagingMembers(null)} onMembersUpdated={fetchRoomData} />}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>{room.name}</h1>
                <div className="header-actions" style={{display: 'flex', gap: '1rem'}}>
                    {isOwner && <button className="btn-leave" onClick={handleDeleteRoom}>Delete Room</button>}
                </div>
            </div>
            <p>Owned by: {room.owner.username}</p>
            {room.description && <p className="room-description">{room.description}</p>}
            <hr />

            {isOwner && room.joinRequests && room.joinRequests.length > 0 && (
                <div className="join-requests-panel" style={{backgroundColor: 'var(--secondary-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem'}}>
                    <h3>Join Requests</h3>
                    <ul className="requests-list">
                        {room.joinRequests.map(requestUser => (
                            <li key={requestUser._id} className="room-list-item">
                                <span>{requestUser.username} wants to join</span>
                                <div style={{display: 'flex', gap: '0.5rem'}}>
                                    <button className="btn-action btn-join" onClick={() => handleJoinRequest(requestUser._id, 'approve')}>Approve</button>
                                    <button className="btn-action btn-delete" onClick={() => handleJoinRequest(requestUser._id, 'deny')}>Deny</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="room-layout">
                <div className="main-content">
                    <h2>Projects</h2>
                    {isOwner && <button className="btn" onClick={() => setCreateProjectModalOpen(true)}>Create New Project</button>}
                    {room.projects.length > 0 ? (
                        <ul className="project-list">
                            {room.projects.map(project => (
                                <li key={project._id} className="room-list-item">
                                    <Link to={`/projects/${project._id}`}>{project.name} ({project.projectType})</Link>
                                    {isOwner && (
                                        <div className="room-actions">
                                            <button className="btn-action btn-edit" onClick={() => setManagingMembers(project)}>Members</button>
                                            <button className="btn-action btn-edit" onClick={() => setEditingProject(project)}>Edit</button>
                                            <button className="btn-action btn-delete" onClick={() => handleDeleteProject(project._id)}>Delete</button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>No projects have been created yet.</p>
                    )}
                    <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={user} />
                </div>
                <div className="sidebar">
                    <h3>Members ({room.members.length})</h3>
                    <ul className="member-list">
                        {room.members.map(member => (
                            <li key={member._id} className="room-list-item" style={{justifyContent: 'flex-start'}}>
                                {member.username}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default RoomPage;