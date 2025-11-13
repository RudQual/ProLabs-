import React, { useState } from 'react';
import {
  FiFile,
  FiFolder,
  FiFolderPlus,
  FiFilePlus,
  FiEdit3,
  FiTrash2,
  FiChevronRight,
  FiChevronDown
} from 'react-icons/fi';

export default function FileExplorer({
  tree,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onFolderSelect,
  selectedFolderPath
}) {
  const [expanded, setExpanded] = useState(new Set());

  const toggleExpand = (path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const render = (node, depth = 0) => {
    const isOpen = expanded.has(node.path);

    return (
      <div key={node._id || node.path}>
        <div
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer group ${
            node.isFolder && selectedFolderPath === node.path
              ? 'bg-slate-700'
              : 'hover:bg-slate-800'
          }`}
          style={{ paddingLeft: depth * 12 }}
          onClick={() => {
            if (node.isFolder) {
              toggleExpand(node.path);
              onFolderSelect?.(node);
            } else {
              onOpen(node);
            }
          }}
        >
          {node.isFolder ? (
            <span className="flex items-center">
              {isOpen ? <FiChevronDown /> : <FiChevronRight />}
              <FiFolder className="ml-1 text-yellow-400" />
            </span>
          ) : (
            <FiFile className="text-slate-400" />
          )}
          <span className="truncate">{node.name}</span>
          <div className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100 transition">
            <button
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                const name = prompt('New name', node.name);
                if (name) onRename(node, name);
              }}
            >
              <FiEdit3 />
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete?')) onDelete(node);
              }}
            >
              <FiTrash2 />
            </button>
          </div>
        </div>

        {/* Recursive children */}
        {node.isFolder && isOpen && node.children?.length > 0 && (
          <div className="ml-3">
            {node.children.map((child) => render(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-72 h-full bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Header */}
      <div className="h-10 border-b border-slate-800 px-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400">
          Explorer
        </div>
        <div className="flex gap-2">
          <button
            title="New Folder"
            onClick={() => onCreate({ isFolder: true })}
            className="hover:text-indigo-400"
          >
            <FiFolderPlus />
          </button>
          <button
            title="New File"
            onClick={() => onCreate({ isFolder: false })}
            className="hover:text-indigo-400"
          >
            <FiFilePlus />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2 text-sm text-slate-300">
        {tree.length > 0 ? (
          tree.map((n) => render(n))
        ) : (
          <div className="text-slate-500 text-xs italic mt-4 px-2">
            No files yet. Create one!
          </div>
        )}
      </div>
    </div>
  );
}
