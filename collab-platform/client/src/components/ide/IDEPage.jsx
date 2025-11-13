import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import FileExplorer from '../components/ide/FileExplorer';
import { socket, joinDoc, leaveDoc, updateDoc } from '../socket';
import { FiSave, FiPlay, FiX } from 'react-icons/fi';

const buildTree = (files) => {
  const root = [];
  const map = {};
  files.forEach(f => { map[f.path] = { ...f, children: [] }; });
  files.forEach(f => {
    const parts = f.path.split('/'); parts.pop();
    const parentPath = parts.join('/');
    if (parentPath && map[parentPath]) {
      map[parentPath].children.push(map[f.path]);
    } else {
      root.push(map[f.path]);
    }
  });
  return root.sort((a,b)=>a.isFolder===b.isFolder ? a.name.localeCompare(b.name) : a.isFolder? -1 : 1);
};

export default function IDEPage() {
  const { projectId } = useParams();
  const [files, setFiles] = useState([]);
  const [tree, setTree] = useState([]);
  const [active, setActive] = useState(null); // {file, content, version}
  const [tabs, setTabs] = useState([]);

  const fetchFiles = useCallback(async () => {
    const { data } = await axios.get(`/api/files/project/${projectId}`);
    setFiles(data);
    setTree(buildTree(data));
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // open file: join doc room and load snapshot
  const openFile = useCallback((file) => {
    if (file.isFolder) return;
    setTabs(t => {
      if (t.find(x => x.file._id===file._id)) return t;
      return [...t, { file, content: file.content || '', version: 0 }];
    });
    setActive({ file, content: file.content || '', version: 0 });
    joinDoc(projectId, file.path);
    socket.once('doc:snapshot', ({ content, version }) => {
      setTabs(t => t.map(tab => tab.file._id===file._id ? { ...tab, content, version } : tab));
      setActive({ file, content, version });
    });
    socket.on('doc:patch', ({ path, content, version }) => {
      if (path !== file.path) return;
      setTabs(t => t.map(tab => tab.file._id===file._id ? { ...tab, content, version } : tab));
      setActive(a => a && a.file._id===file._id ? { ...a, content, version } : a);
    });
  }, [projectId]);

  useEffect(() => () => {
    if (active?.file) leaveDoc(projectId, active.file.path);
    socket.off('doc:patch');
  }, [projectId, active?.file]);

  const onCreate = async ({ isFolder }) => {
    const name = prompt(isFolder ? 'Folder name' : 'File name');
    if (!name) return;
    const base = name;
    const path = base; // could add parent folder context if selected
    const { data } = await axios.post('/api/files', { name, path, projectId, isFolder });
    await fetchFiles();
    if (!isFolder) openFile(data);
  };

  const onRename = async (node, name) => {
    await axios.put(`/api/files/${node._id}/rename`, { name });
    await fetchFiles();
  };

  const onDelete = async (node) => {
    await axios.delete(`/api/files/${node._id}`);
    await fetchFiles();
    setTabs(t => t.filter(tab => tab.file._id!==node._id));
    if (active?.file?._id === node._id) setActive(null);
  };

  const onChange = (val) => {
    if (!active) return;
    const nextVersion = (active.version || 0) + 1;
    setActive(a => ({ ...a, content: val, version: nextVersion }));
    setTabs(t => t.map(tab => tab.file._id===active.file._id ? { ...tab, content: val, version: nextVersion } : tab));
    updateDoc({ roomId: projectId, path: active.file.path, content: val, version: nextVersion });
  };

  const onSave = async () => {
    if (!active) return;
    await axios.put(`/api/files/${active.file._id}`, { content: active.content });
    // optional toast
  };

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 flex">
      <FileExplorer tree={tree} onOpen={openFile} onCreate={onCreate} onRename={onRename} onDelete={onDelete} />
      <div className="flex-1 flex flex-col">
        {/* Tabs */}
        <div className="h-10 border-b border-slate-800 flex items-center overflow-auto">
          {tabs.map(tab => (
            <button key={tab.file._id}
              onClick={()=>setActive(tab)}
              className={`px-3 h-full flex items-center gap-2 border-r border-slate-800 ${active?.file._id===tab.file._id?'bg-slate-900':''}`}>
              {tab.file.name}
              <FiX className="opacity-50 hover:opacity-100"
                onClick={(e)=>{e.stopPropagation(); setTabs(t => t.filter(x=>x.file._id!==tab.file._id)); if(active?.file._id===tab.file._id) setActive(null); }} />
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 px-2">
            <button onClick={onSave} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded flex items-center gap-2 text-sm"><FiSave/> Save</button>
            <button disabled className="px-3 py-1 bg-slate-800 rounded flex items-center gap-2 text-sm opacity-60 cursor-not-allowed"><FiPlay/> Run</button>
          </div>
        </div>
        {/* Editor */}
        <div className="flex-1">
          {active ? (
            <Editor
              height="100%"
              theme="vs-dark"
              language="javascript"
              value={active.content}
              onChange={onChange}
              options={{ minimap: { enabled: true }, fontSize: 14, smoothScrolling: true, scrollBeyondLastLine: false }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm opacity-70">Open a file from the explorer</div>
          )}
        </div>
      </div>
    </div>
  );
}
