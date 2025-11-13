import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const useRoomStore = create(immer((set) => ({
	roomId: null,
	role: 'member', // or 'admin'
	participants: [],
	permissions: { canEdit: false },
	setRoom(state) { set(draft => { draft.roomId = state.roomId; draft.role = state.role; }); },
	setParticipants(list) { set(draft => { draft.participants = list; }); },
	setCanEdit(can) { set(draft => { draft.permissions.canEdit = can; }); }
})));


