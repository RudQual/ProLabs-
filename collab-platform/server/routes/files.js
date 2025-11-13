const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const File = require('../models/File');
const Project = require('../models/Project');

// @route    GET api/files/project/:projectId
// @desc     Get all files and folders for a project
router.get('/project/:projectId', auth, async (req, res) => {
    try {
        const files = await File.find({ project: req.params.projectId }).sort({ path: 1 });
        res.json(files);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    GET api/files/:fileId
// @desc     Get a single file's content
router.get('/:fileId', auth, async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId);
        if (!file) return res.status(404).json({ msg: 'File not found' });
        res.json(file);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route    POST api/files
// @desc     Create a new file or folder
router.post('/', auth, async (req, res) => {
    const { name, path, projectId, isFolder } = req.body;
    
    // Validate required fields
    if (!name || !name.trim()) {
        return res.status(400).json({ msg: 'File or folder name is required.' });
    }
    if (!projectId) {
        return res.status(400).json({ msg: 'Project ID is required.' });
    }
    
    try {
        // Normalize path: remove leading/trailing slashes, collapse multiple slashes
        const cleanName = name.trim();
        const normalizedPath = path ? path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/') : '';
        const finalPath = normalizedPath ? `${normalizedPath}/${cleanName}` : cleanName;

        // Check if file/folder with this path already exists
        const existing = await File.findOne({ project: projectId, path: finalPath });
        if (existing) {
            return res.status(400).json({ msg: `A file or folder with the name "${cleanName}" already exists at this location.` });
        }

        const newFile = new File({
            name: cleanName,
            path: finalPath,
            project: projectId,
            isFolder: isFolder === true || isFolder === 'true',
            content: (isFolder === true || isFolder === 'true') ? '' : '// Your code here...'
        });
        const file = await newFile.save();
        res.json(file);
    } catch (err) {
        // Handle duplicate key error from MongoDB unique index
        if (err.code === 11000) {
            return res.status(400).json({ msg: `A file or folder with the name "${name}" already exists at this location.` });
        }
        // Handle validation errors
        if (err.name === 'ValidationError') {
            return res.status(400).json({ msg: 'Validation error', error: err.message });
        }
        console.error('File creation error:', err);
        res.status(500).json({ msg: 'Server Error', error: err.message || 'Unknown error occurred' });
    }
});

// @route    PUT api/files/:fileId
// @desc     Update a file's content
router.put('/:fileId', auth, async (req, res) => {
    try {
        const { content } = req.body;
        const file = await File.findByIdAndUpdate(
            req.params.fileId,
            { $set: { content } },
            { new: true }
        );
        res.json(file);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route    DELETE api/files/:fileId
// @desc     Delete a file or folder
router.delete('/:fileId', auth, async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId);
        if (!file) return res.status(404).json({ msg: 'File not found' });

        // If it's a folder, delete all children
        if (file.isFolder) {
            await File.deleteMany({ project: file.project, path: { $regex: `^${file.path}/` } });
        }
        await file.deleteOne();
        res.json({ msg: 'File removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;