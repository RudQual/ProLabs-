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
    try {
        const newFile = new File({
            name,
            path,
            project: projectId,
            isFolder,
            content: isFolder ? '' : '// Your code here...'
        });
        const file = await newFile.save();
        res.json(file);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
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