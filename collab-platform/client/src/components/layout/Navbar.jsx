// src/components/layout/Navbar.jsx
import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';

const Navbar = () => {
  const { isAuthenticated, logout } = useContext(AuthContext);
  const location = useLocation();

  // Extract current projectId from URL if user is inside a project or room
  const match = location.pathname.match(/\/ide\/([a-zA-Z0-9]+)/);
  const projectId = match ? match[1] : null;

  const authLinks = (
    <ul className="flex items-center gap-4">
      <li>
        <Link
          to="/dashboard"
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
        >
          Dashboard
        </Link>
      </li>
      <li>
        <Link
          to="/profile"
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
        >
          Profile
        </Link>
      </li>

      {/* 👇 IDE link shows only when inside a room or when projectId available */}
      {projectId && (
        <li>
          <a
            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition"
            href={`/ide/${projectId}`}
          >
            Open IDE
          </a>
        </li>
      )}

      <li>
        <button
          onClick={logout}
          className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition"
        >
          Logout
        </button>
      </li>
    </ul>
  );

  const guestLinks = (
    <ul className="flex items-center gap-4">
      <li>
        <Link
          to="/register"
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
        >
          Register
        </Link>
      </li>
      <li>
        <Link
          to="/login"
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
        >
          Login
        </Link>
      </li>
    </ul>
  );

  return (
    <nav className="w-full flex justify-between items-center px-6 py-3 bg-slate-950 border-b border-slate-800 text-slate-100">
      <h1 className="text-xl font-bold">
        <Link to="/" className="hover:text-indigo-400 transition">CodeCollab</Link>
      </h1>
      <div>{isAuthenticated ? authLinks : guestLinks}</div>
    </nav>
  );
};

export default Navbar;
