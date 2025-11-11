import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const useIDEStore = create(immer((set) => ({
	openTabs: [],           // [{_id, path, name}]
	activeFileId: null,
	unsavedById: {},        // id -> content
	writeAccess: false,
	setWriteAccess(val) { set(draft => { draft.writeAccess = val; }); },
	openFile(file) {
		set(draft => {
			if (!draft.openTabs.find(t => t._id === file._id)) draft.openTabs.push({ _id: file._id, path: file.path, name: file.name });
			draft.activeFileId = file._id;
		});
	},
	closeTab(fileId) { set(draft => { draft.openTabs = draft.openTabs.filter(t => t._id !== fileId); if (draft.activeFileId === fileId) draft.activeFileId = draft.openTabs[0]?._id || null; }); },
	markUnsaved(fileId, content) { set(draft => { draft.unsavedById[fileId] = content; }); },
	clearUnsaved(fileId) { set(draft => { delete draft.unsavedById[fileId]; }); }
})));


