import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export const useRTCStore = create(immer((set) => ({
	localStream: null,
	peers: {}, // socketId -> { stream }
	media: { mic: false, cam: false, sharing: false },
	setLocalStream(stream) { set(draft => { draft.localStream = stream; }); },
	setPeers(update) { set(draft => { draft.peers = update; }); },
	setMedia(partial) { set(draft => { draft.media = { ...draft.media, ...partial }; }); }
})));


