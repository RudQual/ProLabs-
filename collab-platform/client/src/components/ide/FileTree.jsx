import React, { useMemo, useState, useCallback } from 'react';
import { FaFile, FaFolder, FaFolderOpen } from 'react-icons/fa';

// Convert flat list (with path and isFolder) into a tree for rendering
function buildTree(files) {
	const root = { name: '/', children: {}, isFolder: true, path: '' };
	for (const file of files) {
		const parts = file.path.split('/').filter(Boolean);
		let node = root;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;
			if (!node.children[part]) {
				node.children[part] = {
					name: part,
					children: {},
					isFolder: isLast ? file.isFolder : true,
					path: parts.slice(0, i + 1).join('/'),
					_id: isLast ? file._id : undefined,
					content: isLast ? file.content : undefined
				};
			} else if (isLast && !node.children[part].isFolder) {
				node.children[part]._id = file._id;
				node.children[part].content = file.content;
			}
			node = node.children[part];
		}
	}
	return root;
}

const TreeNode = ({ node, level, expanded, toggle, onOpenFile, onSelectFolder, selectedFilePath, selectedFolderPath }) => {
	const isOpen = expanded.has(node.path);
	const isFolder = node.isFolder;
	const isFileSelected = !isFolder && selectedFilePath === node.path;
	const isFolderSelected = isFolder && selectedFolderPath === node.path;

	if (!isFolder) {
		return (
			<li
				className={`file-item ${isFileSelected ? 'selected' : ''}`}
				style={{ paddingLeft: `${level * 14}px` }}
				onClick={() => onOpenFile(node)}
			>
				<FaFile style={{ marginRight: 6 }} />
				<span>{node.name}</span>
			</li>
		);
	}

	const childEntries = Object.values(node.children).sort((a, b) => {
		if (a.isFolder && !b.isFolder) return -1;
		if (!a.isFolder && b.isFolder) return 1;
		return a.name.localeCompare(b.name);
	});

	return (
		<li>
			<div
				className={`file-item folder ${isFolderSelected ? 'selected' : ''}`}
				style={{ paddingLeft: `${level * 14}px` }}
				onClick={() => {
					toggle(node.path);
					onSelectFolder?.(node);
				}}
			>
				{isOpen ? <FaFolderOpen style={{ marginRight: 6 }} /> : <FaFolder style={{ marginRight: 6 }} />}
				<span>{node.name || '/'}</span>
			</div>
			{isOpen && childEntries.length > 0 && (
				<ul className="file-children">
					{childEntries.map(child => (
						<TreeNode
							key={child.path || child._id}
							node={child}
							level={level + 1}
							expanded={expanded}
							toggle={toggle}
							onOpenFile={onOpenFile}
							onSelectFolder={onSelectFolder}
							selectedFilePath={selectedFilePath}
							selectedFolderPath={selectedFolderPath}
						/>
					))}
				</ul>
			)}
		</li>
	);
};

const FileTree = ({ files, onFileSelect, selectedFile, onFolderSelect, selectedFolderPath }) => {
	const tree = useMemo(() => buildTree(files), [files]);
	const [expanded, setExpanded] = useState(new Set([''])); // root open
	const [internalFolder, setInternalFolder] = useState('');

	const activeFolderPath = selectedFolderPath !== undefined ? selectedFolderPath : internalFolder;
	const activeFilePath = selectedFile?.path || '';

	const toggle = useCallback((path) => {
		setExpanded(prev => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const handleOpenFile = useCallback((node) => {
		if (onFileSelect) {
			onFileSelect({ _id: node._id, name: node.name, path: node.path, isFolder: false, content: node.content });
		}
	}, [onFileSelect]);

	const handleSelectFolder = useCallback((node) => {
		if (onFolderSelect) {
			onFolderSelect(node);
		} else {
			setInternalFolder(node.path || '');
		}
	}, [onFolderSelect]);

	return (
		<div className="file-tree-panel">
			<div className="file-tree-header">Explorer</div>
			<ul className="file-list">
				<TreeNode
					node={tree}
					level={0}
					expanded={expanded}
					toggle={toggle}
					onOpenFile={handleOpenFile}
					onSelectFolder={handleSelectFolder}
					selectedFilePath={activeFilePath}
					selectedFolderPath={activeFolderPath}
				/>
			</ul>
		</div>
	);
};

export default FileTree;