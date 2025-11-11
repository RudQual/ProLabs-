const express = require('express');
const router = express.Router();
const Docker = require('dockerode');
const stream = require('stream');

const docker = new Docker();

router.post('/', async (req, res) => {
    const { code } = req.body;

    // Create a temporary file content to be run
    const fileContent = Buffer.from(code);

    let output = '';

    const logStream = new stream.PassThrough();
    logStream.on('data', (chunk) => {
        output += chunk.toString('utf8');
    });

    try {
        console.log('Creating container...');
        const container = await docker.createContainer({
            Image: 'node-runner', // The image we built earlier
            Cmd: ['node', '-e', code], // Execute the code directly
            Tty: false,
            HostConfig: {
                // Important: This stops the container after 10 seconds to prevent infinite loops
                StopTimeout: 10
            }
        });

        await container.start();
        console.log('Container started. Waiting for output...');

        const stream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true
        });

        stream.pipe(logStream);

        // Wait for the container to finish
        await container.wait();
        console.log('Container finished execution.');

        await container.remove();
        console.log('Container removed.');

        res.json({ output });

    } catch (err) {
        console.error('Docker execution error:', err);
        res.status(500).json({ output: `Execution failed: ${err.message}` });
    }
});

module.exports = router;