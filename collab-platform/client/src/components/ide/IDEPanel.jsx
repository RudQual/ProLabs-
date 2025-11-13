import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import FileExplorer from './FileExplorer';
import { socket, joinDoc, leaveDoc, updateDoc } from '../../socket';
import { FiSave, FiGitBranch, FiX } from 'react-icons/fi';

export default function IDEPanel({ roomId, projectId, currentUser }) {
  const [files, setFiles] = useState([]);
  const [tree, setTree] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [active, setActive] = useState(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState('');

  // Build file tree from flat structure
  const buildTree = (items) => {
    const map = new Map(items.map(f => [f.path, { ...f, children: [] }]));
    const roots = [];
    for (const f of items) {
      const parentPath = f.path.split('/').slice(0, -1).join('/');
      if (parentPath && map.has(parentPath)) map.get(parentPath).children.push(map.get(f.path));
      else roots.push(map.get(f.path));
    }
    const sort = (n) => {
      n.children?.sort((a, b) =>
        a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1
      );
      n.children?.forEach(sort);
    };
    roots.forEach(sort);
    return roots;
  };

  // Fetch files for this project
  const fetchFiles = async () => {
    if (!projectId) return;
    try {
      const { data } = await axios.get(`/api/files/project/${projectId}`);
      setFiles(data);
      setTree(buildTree(data));
    } catch (err) {
      console.error('Fetch files failed:', err);
    }
  };
  useEffect(() => { fetchFiles(); }, [projectId]);

  // Collaborative editing setup
  useEffect(() => {
    if (!active?.file) return;
    const path = active.file.path;
    joinDoc(projectId, path);

    const onSnap = ({ content, version }) => {
      setTabs(t =>
        t.map(x => (x.file._id === active.file._id ? { ...x, content, version } : x))
      );
      setActive(a => (a && a.file._id === active.file._id ? { ...a, content, version } : a));
    };

    const onPatch = ({ content, version }) => {
      setTabs(t =>
        t.map(x => (x.file._id === active.file._id ? { ...x, content, version } : x))
      );
      setActive(a => (a && a.file._id === active.file._id ? { ...a, content, version } : a));
    };

    socket.once('doc:snapshot', onSnap);
    socket.on('doc:patch', onPatch);
    return () => {
      leaveDoc(projectId, path);
      socket.off('doc:patch', onPatch);
    };
  }, [projectId, active?.file?._id]);

  // File actions
  const openFile = (file) => {
    if (file.isFolder) return;
    setTabs(t =>
      t.find(x => x.file._id === file._id)
        ? t
        : [...t, { file, content: file.content || '', version: 0 }]
    );
    setActive({ file, content: file.content || '', version: 0 });
  };

  const onCreate = async ({ isFolder }) => {
    const name = prompt(isFolder ? 'Folder name' : 'File name');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const parentPath = selectedFolderPath ? selectedFolderPath.replace(/^\/+|\/+$/g, '') : '';
    try {
      const { data: newFile } = await axios.post('/api/files', {
        name: cleanName,
        path: parentPath,
        projectId,
        isFolder
      });
      const updated = [...files, newFile];
      setFiles(updated);
      setTree(buildTree(updated));
      if (!isFolder) openFile(newFile);
    } catch (err) {
      console.error('Create failed:', err.response?.data || err);
      alert(err.response?.data?.msg || 'Failed to create file/folder.');
    }
  };

  const onRename = async (node, name) => {
    if (!name || !name.trim()) return;
    try {
      await axios.put(`/api/files/${node._id}/rename`, { name: name.trim() });
      await fetchFiles();
    } catch {
      alert('Rename failed.');
    }
  };

  const onDelete = async (node) => {
    if (!window.confirm(`Delete "${node.name}"?`)) return;
    try {
      await axios.delete(`/api/files/${node._id}`);
      await fetchFiles();
      setTabs(t => t.filter(x => x.file._id !== node._id));
      if (active?.file._id === node._id) setActive(null);
    } catch {
      alert('Delete failed.');
    }
  };

  // Live content updates
  const onChange = (val) => {
    if (!active) return;
    const nextVersion = (active.version || 0) + 1;
    setActive(a => ({ ...a, content: val, version: nextVersion }));
    setTabs(t =>
      t.map(x => (x.file._id === active.file._id ? { ...x, content: val, version: nextVersion } : x))
    );
    updateDoc({ roomId: projectId, path: active.file.path, content: val, version: nextVersion });
  };

  // Save + commit
  const save = async () => {
    if (!active) return;
    try {
      await axios.put(`/api/files/${active.file._id}`, { content: active.content });
      alert('Saved.');
    } catch {
      alert('Save failed.');
    }
  };

  const requestCommit = async () => {
    if (!active) return;
    try {
      const changed = tabs.filter(t => t.content !== files.find(f => f._id === t.file._id)?.content);
      if (!changed.length) return alert('No changes to commit.');
      const diffs = changed.map(t => `### ${t.file.path}\n${t.content}`).join('\n\n');
      await axios.post(`/api/rooms/${roomId}/commit`, {
        projectId,
        diffs,
        authorId: currentUser._id
      });
      alert('Commit request sent.');
    } catch (err) {
      console.error(err);
      alert('Commit failed.');
    }
  };

  return (
    <div className="h-full w-full flex">
      <FileExplorer
        tree={tree}
        onOpen={openFile}
        onCreate={onCreate}
        onRename={onRename}
        onDelete={onDelete}
        onFolderSelect={(node) => setSelectedFolderPath(node.isFolder ? node.path : '')}
        selectedFolderPath={selectedFolderPath}
      />
      <div className="flex-1 flex flex-col">
        {/* Tabs */}
        <div className="h-10 border-b border-slate-800 flex items-center overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.file._id}
              className={`px-3 h-full flex items-center gap-2 border-r border-slate-800 ${
                active?.file._id === tab.file._id ? 'bg-slate-900' : ''
              }`}
              onClick={() => setActive(tab)}
            >
              {tab.file.name}
              <FiX
                className="opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setTabs(t => t.filter(x => x.file._id !== tab.file._id));
                  if (active?.file._id === tab.file._id) setActive(null);
                }}
              />
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 px-2">
            <button onClick={save} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded flex items-center gap-2 text-sm">
              <FiSave /> Save
            </button>
            <button onClick={requestCommit} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-2 text-sm">
              <FiGitBranch /> Commit
            </button>
          </div>
        </div>
        <div className="flex-1">
          {active ? (
            <Editor
              height="100%"
              theme="vs-dark"
              language="javascript"
              value={active.content}
              onChange={onChange}
              options={{ minimap: { enabled: true }, fontSize: 14 }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-400">
              Open a file from Explorer
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
