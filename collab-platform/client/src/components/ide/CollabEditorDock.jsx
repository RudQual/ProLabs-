import React, { useEffect, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import FileTree from './FileTree';
import { socket } from '../../socket';

const CollabEditorDock = ({ roomId, roomProjects, currentUser }) => {
	const [selectedProject, setSelectedProject] = useState(roomProjects?.[0] || null);
	const [files, setFiles] = useState([]);
	const [currentFile, setCurrentFile] = useState(null);
	const [selectedFolderPath, setSelectedFolderPath] = useState('');
	const [editor, setEditor] = useState(null);
	const [isSaving, setIsSaving] = useState(false);

	const refreshFiles = useCallback(async (projectId) => {
		try {
			const { data } = await axios.get(`/api/files/project/${projectId}`);
			setFiles(data);
			if (!currentFile) {
				const firstFile = data.find(f => !f.isFolder);
				if (firstFile) {
					setCurrentFile(firstFile);
					const parentPath = firstFile.path.includes('/') ? firstFile.path.split('/').slice(0, -1).join('/') : '';
					setSelectedFolderPath(parentPath);
				}
			}
		} catch (e) {
			console.error('Failed to load files', e);
		}
	}, [currentFile]);

	useEffect(() => {
		if (selectedProject) {
			refreshFiles(selectedProject._id);
		}
	}, [selectedProject, refreshFiles]);

	useEffect(() => {
		if (!currentFile) return;
		const docId = `room:${roomId}:file:${currentFile._id}`;
		socket.emit('join-doc', docId);
		const handleDocUpdate = (update) => {
			if (editor) {
				const currentValue = editor.getValue();
				if (currentValue !== update) editor.setValue(update);
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

	const handleSelectFile = (file) => {
		setCurrentFile(file);
		const parentPath = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '';
		setSelectedFolderPath(parentPath);
	};

	const handleSelectFolder = (node) => {
		setSelectedFolderPath(node.path || '');
	};

	const handleCreate = async (type) => {
		if (!selectedProject) return;
		const label = type === 'folder' ? 'New folder name' : 'New file name (include extension)';
		const input = window.prompt(label);
		if (!input) return;
		const name = input.trim();
		if (!name) return;

		const fullPath = [selectedFolderPath, name].filter(Boolean).join('/');

		try {
			await axios.post('/api/files', {
				name,
				path: fullPath,
				projectId: selectedProject._id,
				isFolder: type === 'folder'
			});
			const { data } = await axios.get(`/api/files/project/${selectedProject._id}`);
			setFiles(data);

			if (type === 'folder') {
				setSelectedFolderPath(fullPath);
			} else {
				const created = data.find(f => !f.isFolder && f.path === fullPath);
				if (created) {
					setCurrentFile(created);
					setSelectedFolderPath(fullPath.includes('/') ? fullPath.split('/').slice(0, -1).join('/') : '');
				}
			}
		} catch (err) {
			console.error('Create item failed', err);
			alert('Unable to create item. Name might already exist.');
		}
	};

	return (
		<div className="dock-editor">
			<div className="dock-toolbar">
				<select
					value={selectedProject?._id || ''}
					onChange={(e) => {
						const proj = roomProjects.find(p => p._id === e.target.value);
						setSelectedProject(proj || null);
						setCurrentFile(null);
						setSelectedFolderPath('');
					}}
				>
					{roomProjects.map(p => (
						<option key={p._id} value={p._id}>{p.name}</option>
					))}
				</select>
				<div className="spacer" />
				<div className="flex gap-2">
					<button className="btn" onClick={() => handleCreate('file')} disabled={!selectedProject}>New File</button>
					<button className="btn" onClick={() => handleCreate('folder')} disabled={!selectedProject}>New Folder</button>
					<button className="btn" onClick={handleSave} disabled={!currentFile || isSaving}>{isSaving ? 'Saving…' : 'Save'}</button>
				</div>
			</div>
			<div className="dock-body">
				<div className="dock-sidebar">
					<FileTree
						files={files}
						onFileSelect={handleSelectFile}
						selectedFile={currentFile}
						onFolderSelect={handleSelectFolder}
						selectedFolderPath={selectedFolderPath}
					/>
				</div>
				<div className="dock-main">
					{currentFile ? (
						<Editor
							height="100%"
							theme="vs-dark"
							defaultLanguage="javascript"
							key={currentFile._id}
							defaultValue={currentFile.content || ''}
							onMount={(editorInstance) => setEditor(editorInstance)}
							onChange={handleEditorChange}
							options={{ minimap: { enabled: true } }}
						/>
					) : (
						<div className="empty-editor">Select or create a file to start editing.</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default CollabEditorDock;
