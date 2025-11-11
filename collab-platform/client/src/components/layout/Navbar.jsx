// src/components/layout/Navbar.jsx
import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';


const Navbar = () => {
    console.log("3. Navbar component is rendering");
    const { isAuthenticated, logout } = useContext(AuthContext);

    const authLinks = (
        <ul>
            {/* ADD THIS LINK */}
            <li><Link to="/dashboard">Dashboard</Link></li>
            <li><Link to="/profile">Profile</Link></li>
            <li><a onClick={logout} href="#!">Logout</a></li>
        </ul>
    );

    const guestLinks = (
        <ul>
            <li><Link to="/register">Register</Link></li>
            <li><Link to="/login">Login</Link></li>
        </ul>
    );

    return (
        <nav className="navbar">
            <h1>
                <Link to="/">CodeCollab</Link>
            </h1>
            <div className="nav-links">
                {isAuthenticated ? authLinks : guestLinks}
            </div>
        </nav>
    );
};

export default Navbar;