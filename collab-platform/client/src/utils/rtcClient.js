import SimplePeer from 'simple-peer';
import { socket } from '../socket';

export function createPeer(initiator, remoteId, stream, roomId, peersRef, onRemoteStream) {
	const peer = new SimplePeer({ initiator, trickle: true, stream });
	peer.on('signal', signal => {
		socket.emit('webrtc-signal', { roomId, to: remoteId, from: socket.id, signal });
	});
	peer.on('stream', remoteStream => {
		onRemoteStream(remoteId, remoteStream);
	});
	peer.on('error', () => { try { peer.destroy(); } catch (_) {} });
	peersRef.current[remoteId] = peer;
	return peer;
}

export function cleanupPeer(remoteId, peersRef) {
	const p = peersRef.current[remoteId];
	if (p) { try { p.destroy(); } catch (_) {} delete peersRef.current[remoteId]; }
}


