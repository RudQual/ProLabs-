import React from 'react';
import { FaFile, FaFolder, FaPlus } from 'react-icons/fa';

const FileTree = ({ files, onFileSelect }) => {
    
    // A simple function to add indentation based on path depth
    const getIndentation = (path) => {
        const depth = path.split('/').length - 1;
        return { paddingLeft: `${depth * 15}px` };
    };

    return (
        <div className="file-tree-panel">
            <h3>File Explorer</h3>
            <ul className="file-list">
                {files.map(file => (
                    <li 
                        key={file._id} 
                        className="file-item"
                        style={getIndentation(file.path)}
                        onClick={() => !file.isFolder && onFileSelect(file)}
                    >
                        {file.isFolder ? <FaFolder /> : <FaFile />}
                        <span>{file.name}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default FileTree;