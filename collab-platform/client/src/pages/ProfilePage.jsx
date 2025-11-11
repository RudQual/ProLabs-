import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AIAssessmentModal from '../components/assessment/AIAssessmentModal';

const availableSkills = [
    "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node.js", "Express.js",
    "Python", "Django", "Flask", "Java", "Spring Boot", "C#", ".NET",
    "MongoDB", "PostgreSQL", "MySQL", "Docker", "Kubernetes", "AWS", "Azure",
    "Git", "CI/CD", "HTML5", "CSS3", "Sass"
];

const ProfilePage = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSkill, setSelectedSkill] = useState(availableSkills[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/profile/me');
            setProfile(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);
    
    const handleModalClose = () => {
        setIsModalOpen(false);
        // Re-fetch the profile data to show the user's updated mastery score
        fetchProfile();
    };

    const handleAddSkill = () => {
        if (!profile || profile.skills.find(skill => skill.name === selectedSkill)) {
            alert("Skill already added!");
            return;
        }
        const newSkill = { name: selectedSkill, mastery: 0 };
        setProfile({ ...profile, skills: [...profile.skills, newSkill] });
    };

    const handleUpdateProfile = async () => {
        try {
            const body = { skills: profile.skills, socialLinks: profile.socialLinks };
            const res = await axios.put('/api/profile', body);
            setProfile(res.data);
            alert("Profile Updated Successfully!");
        } catch (err) {
            console.error(err);
            alert("Error updating profile.");
        }
    };

    if (loading) {
        return <div className="container">Loading...</div>;
    }

    if (!profile) {
        return <div className="container">Could not load profile.</div>;
    }

    const cooldownTime = profile.assessmentCooldownExpires ? new Date(profile.assessmentCooldownExpires) : null;
    const isOnCooldown = cooldownTime && cooldownTime > new Date();

    return (
        <div className="container">
            {isModalOpen && <AIAssessmentModal onClose={handleModalClose} userSkills={profile.skills} />}

            <h1>My Profile</h1>
            <h2>{profile.username} ({profile.email})</h2>
            <hr />

            <div className="assessment-section" style={{ margin: '2rem 0' }}>
                <h3>Skill Assessment</h3>
                <p>Test your skills to update your mastery levels.</p>
                <button
                    className="btn"
                    onClick={() => setIsModalOpen(true)}
                    disabled={isOnCooldown}
                >
                    Start AI Assessment
                </button>
                {isOnCooldown && (
                    <p style={{ color: 'orange', marginTop: '0.5rem' }}>
                        Next assessment available at: {cooldownTime.toLocaleString()}
                    </p>
                )}
            </div>
            <hr />

            <h3>My Skills</h3>
            <div>
                {profile.skills.length > 0 ? (
                    <ul>
                        {profile.skills.map(skill => (
                            <li key={skill._id || skill.name}>{skill.name} - Mastery: {skill.mastery}%</li>
                        ))}
                    </ul>
                ) : (
                    <p>No skills added yet. Add a skill below to get started.</p>
                )}
            </div>
            <div style={{ margin: '2rem 0' }}>
                <select value={selectedSkill} onChange={e => setSelectedSkill(e.target.value)}>
                    {availableSkills.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={handleAddSkill} style={{ marginLeft: '1rem' }} className="btn">Add Skill</button>
            </div>
            <button onClick={handleUpdateProfile} className="btn">Save Changes</button>
        </div>
    );
};

export default ProfilePage;