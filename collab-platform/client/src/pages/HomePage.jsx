import React, { useContext } from 'react';
import AuthContext from '../context/AuthContext';

const HomePage = () => {
    console.log("4. HomePage component is rendering");
    
    const { isAuthenticated } = useContext(AuthContext);
    return (
        <div className="container">
            <h1>Welcome to CodeCollab</h1>
            {isAuthenticated ?
                <p>You are logged in. This is where your dashboard with rooms will be.</p> :
                <p>Please log in or register to continue.</p>
            }
        </div>
    );
};
export default HomePage;