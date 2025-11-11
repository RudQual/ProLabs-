import React, { useContext, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
const queryClient = new QueryClient();

const AppContent = () => {
  console.log("2. AppContent component is rendering");
  const { user, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      if (!socket.connected) {
        socket.connect();
      }
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

      const handleCommitRequest = (payload) => {
          toast.info(`Commit requested: ${payload.summary}`, {
              position: "top-right",
              autoClose: 8000,
              theme: "dark",
              onClick: () => navigate(`/rooms/${payload.roomId}`)
          });
      };
      const handleCommitApproved = () => {
          toast.success("Admin approved your commit.", { position: "top-right", autoClose: 6000, theme: "dark" });
      };
      const handleCommitRejected = () => {
          toast.error("Admin rejected your commit.", { position: "top-right", autoClose: 6000, theme: "dark" });
      };
      socket.on('commit-request', handleCommitRequest);
      socket.on('commit-approved', handleCommitApproved);
      socket.on('commit-rejected', handleCommitRejected);

      return () => {
          socket.off('new-notification', handleNewNotification);
          socket.off('commit-request', handleCommitRequest);
          socket.off('commit-approved', handleCommitApproved);
          socket.off('commit-rejected', handleCommitRejected);
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
      <QueryClientProvider client={queryClient}>
        <Toaster position="top-right" toastOptions={{ duration: 6000 }} />
        <AppContent />
      </QueryClientProvider>
    </Router>
  );
}

export default App;