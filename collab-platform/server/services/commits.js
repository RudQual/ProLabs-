const { v4: uuidv4 } = require('uuid');
const { diffLines } = require('diff');
const pending = new Map(); // id -> { id, roomId, authorId, diffs, summary }

function computeDiff(oldText, newText) {
	return diffLines(oldText || '', newText || '');
}

function createRequest({ roomId, authorId, files }) {
	// files: [{ path, oldContent, newContent }]
	const diffs = files.map(f => ({ path: f.path, diff: computeDiff(f.oldContent, f.newContent) }));
	const id = uuidv4();
	const req = { id, roomId, authorId, diffs, summary: '' };
	pending.set(id, req);
	return req;
}

function setSummary(id, summary) {
	const req = pending.get(id);
	if (!req) return null;
	req.summary = summary;
	return req;
}

function take(id) {
	const req = pending.get(id);
	if (req) pending.delete(id);
	return req || null;
}

function get(id) { return pending.get(id) || null; }

module.exports = { createRequest, setSummary, take, get };


