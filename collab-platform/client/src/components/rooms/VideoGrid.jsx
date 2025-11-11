import React, { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { socket } from '../../socket';


const VideoTile = ({ stream, label, isLocal = false }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      if (stream) {
        ref.current.srcObject = stream;
      } else {
        ref.current.srcObject = null;
      }
    }
  }, [stream]);
  
  if (!stream && !isLocal) return null; // Don't show empty remote tiles
  
  return (
    <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-800 h-56 relative">
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={isLocal} className="w-full h-full object-cover"/>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-800">
          <div className="text-slate-500 text-sm">Camera Off</div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 text-xs p-1 bg-slate-900/70">{label}</div>
    </div>
  );
};

export default function VideoGrid({ roomId, micOn, camOn, sharing, onSignal }) {
  const [peers, setPeers] = useState({}); // socketId -> { peer, stream }
  const [localStream, setLocalStream] = useState(null);
  const screenStreamRef = useRef(null);

  // get media
  useEffect(() => {
    let stream = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        setLocalStream(stream);
      } catch (err) {
        console.error('Failed to get user media:', err);
        // Try with just audio if video fails
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setLocalStream(stream);
        } catch (err2) {
          console.error('Failed to get audio:', err2);
        }
      }
    })();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // toggle tracks
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = micOn);
    }
  }, [micOn, localStream]);
  
  useEffect(() => {
    if (localStream && !sharing) {
      localStream.getVideoTracks().forEach(t => t.enabled = camOn);
    }
  }, [camOn, localStream, sharing]);

  // screen share
  useEffect(() => {
    (async () => {
      if (sharing) {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = scr;
        replaceOutgoingVideoTrack(scr.getVideoTracks()[0]);
        scr.getVideoTracks()[0].addEventListener('ended', () => {
          replaceOutgoingVideoTrack(localStream?.getVideoTracks()?.[0]);
        });
      } else if (screenStreamRef.current) {
        replaceOutgoingVideoTrack(localStream?.getVideoTracks()?.[0]);
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing]);

  const replaceOutgoingVideoTrack = (track) => {
    Object.values(peers).forEach(({ peer }) => {
      const sender = peer._pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        if (track) {
          sender.replaceTrack(track).catch(err => console.error('Failed to replace track:', err));
        } else {
          // If no track, remove video by replacing with null (but this might not work, so we'll just disable)
          track?.enabled && (track.enabled = false);
        }
      }
    });
  };

  // signaling
  useEffect(() => {
    if (!localStream) return;

    const handleUserJoined = ({ userId, socketId }) => {
      const peer = new Peer({ initiator: true, trickle: true, stream: localStream });
      peer.on('signal', sig => onSignal({ targetSocketId: socketId, signal: sig, fromUserId: userId }));
      peer.on('stream', remoteStream => {
        setPeers(p => ({ ...p, [socketId]: { peer, stream: remoteStream } }));
      });
      peer.on('close', () => setPeers(p => { const q = { ...p }; delete q[socketId]; return q; }));
      peer.on('error', () => peer.destroy());
      setPeers(p => ({ ...p, [socketId]: { peer, stream: null } }));
    };

    const handleSignal = ({ signal, fromSocketId }) => {
      const entry = peers[fromSocketId];
      if (entry) {
        entry.peer.signal(signal);
      } else {
        // non-initiator
        const peer = new Peer({ initiator: false, trickle: true, stream: localStream });
        peer.on('signal', sig => onSignal({ targetSocketId: fromSocketId, signal: sig }));
        peer.on('stream', remoteStream => {
          setPeers(p => ({ ...p, [fromSocketId]: { peer, stream: remoteStream } }));
        });
        peer.signal(signal);
        setPeers(p => ({ ...p, [fromSocketId]: { peer, stream: null } }));
      }
    };

    const handleUserLeft = ({ socketId }) => {
      const entry = peers[socketId];
      if (entry) {
        entry.peer.destroy();
        setPeers(p => { const q = { ...p }; delete q[socketId]; return q; });
      }
    };

    socket.on('webrtc:user-joined', handleUserJoined);
    socket.on('webrtc:signal', handleSignal);
    socket.on('webrtc:user-left', handleUserLeft);
    return () => {
      socket.off('webrtc:user-joined', handleUserJoined);
      socket.off('webrtc:signal', handleSignal);
      socket.off('webrtc:user-left', handleUserLeft);
      Object.values(peers).forEach(({ peer }) => {
        try {
          peer.destroy();
        } catch (e) {
          console.error('Error destroying peer:', e);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, onSignal]);

  // Only show local video if camera is on or screen is sharing
  const showLocalVideo = camOn || sharing;
  const localVideoStream = sharing ? screenStreamRef.current : (showLocalVideo ? localStream : null);
  
  const tiles = [
    <VideoTile key="local" stream={localVideoStream} label="You" isLocal={true} />,
    ...Object.entries(peers).map(([sid, v]) => (
      <VideoTile key={sid} stream={v.stream} label={`User ${sid.slice(0,6)}`} />
    ))
  ];

  return (
    <div className="p-3 h-full overflow-auto grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
      {tiles}
    </div>
  );
}
