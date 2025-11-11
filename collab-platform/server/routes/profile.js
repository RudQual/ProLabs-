// server/routes/profile.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// @route    GET api/profile/me
// @desc     Get current user's profile
// @access   Private
router.get('/me', auth, async (req, res) => {
    try {
        // Find user by ID from the token, exclude the password
        const profile = await User.findById(req.user.id).select('-password');
        if (!profile) {
            return res.status(404).json({ msg: 'User profile not found' });
        }
        res.json(profile);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    PUT api/profile
// @desc     Update user profile
// @access   Private
router.put('/', auth, async (req, res) => {
    const { skills, socialLinks, socialsPublic } = req.body;

    const profileFields = {};
    if (skills) profileFields.skills = skills;
    if (socialLinks) profileFields.socialLinks = socialLinks;
    if (socialsPublic !== undefined) profileFields.socialsPublic = socialsPublic;


    try {
        let profile = await User.findById(req.user.id);

        if (!profile) {
            return res.status(404).json({ msg: 'User not found' });
        }

        profile = await User.findByIdAndUpdate(
            req.user.id,
            { $set: profileFields },
            { new: true }
        ).select('-password');

        return res.json(profile);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;