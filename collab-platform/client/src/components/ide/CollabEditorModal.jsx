import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import FileTree from './FileTree';
import { socket } from '../../socket';

const CollabEditorModal = ({ isOpen, onClose, roomId, roomProjects, currentUser }) => {
	const [selectedProject, setSelectedProject] = useState(null);
	const [files, setFiles] = useState([]);
	const [currentFile, setCurrentFile] = useState(null);
	const [editor, setEditor] = useState(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isRequestingCommit, setIsRequestingCommit] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		if (roomProjects && roomProjects.length > 0) {
			setSelectedProject(roomProjects[0]);
		}
	}, [isOpen, roomProjects]);

	const fetchFiles = useCallback(async (projectId) => {
		try {
			const res = await axios.get(`/api/files/project/${projectId}`);
			setFiles(res.data);
			const firstFile = res.data.find(f => !f.isFolder);
			setCurrentFile(firstFile || null);
		} catch (e) {
			console.error('Failed to load files', e);
		}
	}, []);

	useEffect(() => {
		if (selectedProject) {
			fetchFiles(selectedProject._id);
		}
	}, [selectedProject, fetchFiles]);

	// Real-time sync via socket
	useEffect(() => {
		if (!currentFile) return;
		const docId = `room:${roomId}:file:${currentFile._id}`;
		socket.emit('join-doc', docId);
		const handleDocUpdate = (update) => {
			if (editor) {
				const currentValue = editor.getValue();
				if (currentValue !== update) {
					editor.setValue(update);
				}
			}
		};
		socket.on('doc-update', handleDocUpdate);
		return () => {
			socket.emit('leave-doc', docId);
			socket.off('doc-update', handleDocUpdate);
		};
	}, [currentFile, editor, roomId]);

	const handleEditorChange = (value) => {
		if (!currentFile) return;
		const docId = `room:${roomId}:file:${currentFile._id}`;
		socket.emit('doc-update', docId, value);
	};

	const handleSave = async () => {
		if (!currentFile || !editor) return;
		try {
			setIsSaving(true);
			await axios.put(`/api/files/${currentFile._id}`, { content: editor.getValue() });
		} catch (e) {
			console.error('Save failed', e);
		} finally {
			setIsSaving(false);
		}
	};

	const requestCommit = async () => {
		if (!selectedProject || !currentFile || !editor) return;
		try {
			setIsRequestingCommit(true);
			const diffText = `Updated ${currentFile.path}\n\n${editor.getValue().slice(0, 2000)}`;
			await axios.post(`/api/rooms/${roomId}/commit`, {
				projectId: selectedProject._id,
				fileId: currentFile._id,
				diffText
			});
		} catch (e) {
			console.error('Commit request failed', e);
		} finally {
			setIsRequestingCommit(false);
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					className="editor-modal-backdrop"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
				>
					<motion.div
						className="editor-modal"
						initial={{ y: 40, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 40, opacity: 0 }}
						transition={{ type: 'spring', stiffness: 300, damping: 30 }}
					>
						<div className="editor-modal-header">
							<div className="project-selector">
								<select
									value={selectedProject?._id || ''}
									onChange={(e) => {
										const proj = roomProjects.find(p => p._id === e.target.value);
										setSelectedProject(proj || null);
									}}
								>
									{roomProjects.map(p => (
										<option key={p._id} value={p._id}>{p.name}</option>
									))}
								</select>
							</div>
							<div className="editor-modal-actions">
								<button className="btn" onClick={handleSave} disabled={isSaving || !currentFile}>{isSaving ? 'Saving...' : 'Save'}</button>
								<button className="btn" onClick={requestCommit} disabled={isRequestingCommit || !currentFile}>{isRequestingCommit ? 'Requesting…' : 'Request Commit'}</button>
								<button className="btn btn-secondary" onClick={onClose}>Close</button>
							</div>
						</div>
						<div className="editor-modal-body">
							<div className="editor-sidebar">
								<FileTree files={files} onFileSelect={setCurrentFile} />
							</div>
							<div className="editor-main">
								{currentFile ? (
									<Editor
										height="70vh"
										theme="vs-dark"
										defaultLanguage="javascript"
										key={currentFile._id}
										defaultValue={currentFile.content || ''}
										onMount={(editorInstance) => setEditor(editorInstance)}
										onChange={handleEditorChange}
									/>
								) : (
									<div className="empty-editor">Select a file to start editing.</div>
								)}
							</div>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};

export default CollabEditorModal;


