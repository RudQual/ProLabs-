import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import AuthContext from '../context/AuthContext';
import EditRoomModal from '../components/rooms/EditRoomModal';
import { socket } from '../socket';

const DashboardPage = () => {
    const { user } = useContext(AuthContext);
    const [myRooms, setMyRooms] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [roomName, setRoomName] = useState('');
    const [roomDescription, setRoomDescription] = useState('');
    const [loading, setLoading] = useState(true);
    const [editingRoom, setEditingRoom] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const fetchRooms = async () => {
        try {
            const res = await axios.get('/api/rooms/myrooms');
            setMyRooms(res.data);
        } catch (err) {
            console.error("Failed to fetch rooms", err);
        }
    };

    const fetchNotifications = async () => {
        try {
            const res = await axios.get('/api/notifications');
            setNotifications(res.data);
        } catch (err) {
            console.error("Failed to fetch notifications", err);
        }
    };

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchRooms(), fetchNotifications()]);
            setLoading(false);
        };
        fetchData();

        const handleDashboardUpdate = (data) => {
            if (data.userId === user._id) {
                fetchRooms();
                fetchNotifications();
            }
        };

        const handleNewNotification = () => {
            fetchNotifications();
        };

        socket.on('dashboard-update', handleDashboardUpdate);
        socket.on('new-notification', handleNewNotification);

        return () => {
            socket.off('dashboard-update', handleDashboardUpdate);
            socket.off('new-notification', handleNewNotification);
        };
    }, [user]);

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        if (!roomName) return alert('Please enter a room name');
        try {
            await axios.post('/api/rooms', { name: roomName, description: roomDescription });
            setRoomName('');
            setRoomDescription('');
            fetchRooms();
        } catch (err) {
            console.error("Failed to create room:", err);
            alert(`Failed to create room: ${err.response?.data?.msg || 'An error occurred.'}`);
        }
    };

    const handleDelete = async (roomId) => {
        if (window.confirm('Are you sure you want to delete this room and all its projects? This cannot be undone.')) {
            try {
                await axios.delete(`/api/rooms/${roomId}`);
                fetchRooms();
            } catch (err) {
                console.error("Failed to delete room:", err);
                alert('Failed to delete room.');
            }
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.get(`/api/rooms/search?q=${searchQuery}`);
            setSearchResults(res.data);
        } catch (err) {
            console.error("Search failed:", err);
        }
    };

    const handleRequestJoin = async (roomId) => {
        try {
            await axios.post(`/api/rooms/${roomId}/request-join`);
            alert('Join request sent!');
            // After sending a request, re-run the search to update the button to a label
            // This requires the backend to also return rooms with pending requests, a future improvement.
            // For now, we'll just remove it from the list.
            setSearchResults(prev => prev.filter(r => r._id !== roomId));
        } catch (err) {
            console.error("Failed to send join request:", err);
            alert('Failed to send join request.');
        }
    };

    if (loading || !user) return <div className="container"><h1>Loading Dashboard...</h1></div>;

    return (
        <div className="container">
            {editingRoom && (
                <EditRoomModal 
                    room={editingRoom} 
                    onClose={() => setEditingRoom(null)} 
                    onRoomUpdated={() => {
                        setEditingRoom(null);
                        fetchRooms();
                    }} 
                />
            )}
            <h1>My Dashboard</h1>
            <hr />
            <div className="dashboard-layout">
                <div className="notifications-panel">
                    <h2>Notifications</h2>
                    {notifications.length > 0 ? (
                        <ul className="notifications-list">
                            {notifications.map(n => (
                                <li key={n._id} className="notification-item">{n.message}</li>
                            ))}
                        </ul>
                    ) : (
                        <p>No new notifications.</p>
                    )}
                </div>
                
                <div className="main-panel">
                    <div className="my-rooms-panel">
                        <h2>My Rooms</h2>
                        {myRooms.length > 0 ? (
                            <ul className="rooms-list">
                                {myRooms.map(room => {
                                    const isOwner = user && user._id === room.owner._id;
                                    return (
                                        <li key={room._id} className="room-list-item">
                                            <Link to={`/rooms/${room._id}`}>
                                                <strong>{room.name}</strong>
                                            </Link>
                                            {isOwner && (
                                                <div className="room-actions">
                                                    <button className="btn-action btn-edit" onClick={() => setEditingRoom(room)}>Edit</button>
                                                    <button className="btn-action btn-delete" onClick={() => handleDelete(room._id)}>Delete</button>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p>You haven't joined or created any rooms yet.</p>
                        )}
                    </div>
                    <div className="create-room-panel">
                        <h2>Create a New Room</h2>
                        <form onSubmit={handleCreateRoom}>
                            <input
                                type="text"
                                placeholder="Enter Room Name"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                required
                            />
                            <textarea
                                placeholder="Enter a short description (optional)"
                                value={roomDescription}
                                onChange={(e) => setRoomDescription(e.target.value)}
                                rows="3"
                            ></textarea>
                            <button type="submit" className="btn">Create Room</button>
                        </form>
                    </div>
                </div>

                <div className="join-panel">
                    <h2>Join a Room</h2>
                    <form onSubmit={handleSearch}>
                        <input
                            type="text"
                            placeholder="Search for public rooms..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" className="btn">Search</button>
                    </form>
                    <ul className="rooms-list" style={{marginTop: '1rem'}}>
                        {searchResults.map(room => {
                            const isOwner = user._id === room.owner._id;
                            const isMember = room.members.some(member => member._id === user._id);

                            return (
                                <li key={room._id} className="room-list-item">
                                    <span>{room.name} (Owner: {room.owner.username})</span>
                                    
                                    {isOwner ? (
                                        <span className="status-label owner">You are the owner</span>
                                    ) : isMember ? (
                                        <span className="status-label member">Already a member</span>
                                    ) : (
                                        <button 
                                            className="btn-action btn-join" 
                                            style={{backgroundColor: '#2a9d8f'}} 
                                            onClick={() => handleRequestJoin(room._id)}>
                                            Request Join
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;