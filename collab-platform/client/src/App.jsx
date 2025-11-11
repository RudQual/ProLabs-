import React, { useContext, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// General Components
import Navbar from './components/layout/Navbar';
import PrivateRoute from './components/routing/PrivateRoute';

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import RoomPage from './pages/RoomPage';
import IDEPage from './pages/IDEPage';

// Context and Socket
import AuthContext from './context/AuthContext';
import { socket } from './socket';

// We need an inner component to use the navigate hook
const AppContent = () => {
  console.log("2. AppContent component is rendering");
  const { user, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      socket.connect();
      socket.emit('register-user', user._id);

      const handleNewNotification = ({ message }) => {
          toast.info(message, {
              position: "top-right",
              autoClose: 10000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
              onClick: () => navigate('/dashboard') // Navigate to dashboard on click
          });
      };
      socket.on('new-notification', handleNewNotification);

      return () => {
          socket.off('new-notification', handleNewNotification);
          socket.disconnect();
      };
    } else {
        socket.disconnect();
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Private Routes */}
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/rooms/:roomId" element={<PrivateRoute><RoomPage /></PrivateRoute>} />
          <Route path="/projects/:projectId" element={<PrivateRoute><IDEPage /></PrivateRoute>} />
        </Routes>
      </main>
    </>
  );
};

function App() {
  return (
    <Router>
      <ToastContainer />
      <AppContent />
    </Router>
  );
}

export default App;