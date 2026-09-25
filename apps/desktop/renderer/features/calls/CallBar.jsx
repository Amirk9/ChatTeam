import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../stores/auth.store.jsx';
import { useCall } from '../../stores/call.store.jsx';
import { onRealtime, emitRealtime } from '../../services/socket.js';

function rtcConfig() {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  // Optional TURN for restrictive NATs (Phase 11: STUN first, TURN via env).
  if (import.meta.env.VITE_TURN_URL) {
    iceServers.push({
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USER || '',
      credential: import.meta.env.VITE_TURN_CRED || '',
    });
  }
  return { iceServers };
}

// Slack-style huddle dock: roster tiles, mute/cam/screen, leave. Audio/video
// is a WebRTC P2P mesh (server only signals); scales to small huddles,
// SFU later per plan.
export default function CallBar() {
  const { user } = useAuth();
  const { call, roster, myId, leave, end, setMedia } = useCall();
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [failed, setFailed] = useState('');
  const localVideo = useRef(null);
  const streamRef = useRef(null);
  const pcs = useRef(new Map());
  const remotes = useRef(new Map());
  const [, force] = useState(0);

  const others = roster.filter((p) => p.userId !== myId);

  useEffect(() => {
    if (!call) return;
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // Mesh with everyone already here; newcomers arrive via peer-joined.
        for (const p of others) await connectPeer(p.userId, true);
      } catch (err) {
        if (alive) setFailed('Microphone unavailable — you are listening only.');
      }
    })();
    const offs = [
      onRealtime('call.peer-joined', async ({ callId, userId }) => {
        if (callId === call.id && userId !== myId) await connectPeer(userId, myId < userId);
      }),
      onRealtime('call.peer-left', ({ callId, userId }) => {
        if (callId === call.id) dropPeer(userId);
      }),
      onRealtime('call.signal', async ({ callId, from, signal }) => {
        if (callId !== call.id) return;
        await handleSignal(from, signal);
      }),
      onRealtime('call.ended', ({ callId }) => {
        if (callId === call.id) teardown();
      }),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id]);

  async function connectPeer(peerId, polite) {
    if (pcs.current.has(peerId)) return;
    const pc = new RTCPeerConnection(rtcConfig());
    pcs.current.set(peerId, { pc, polite });
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) pc.addTrack(track, streamRef.current);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) emitRealtime('call.signal', { callId: call.id, to: peerId, signal: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      remotes.current.set(peerId, e.streams[0]);
      force((n) => n + 1);
    };
    if (polite) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emitRealtime('call.signal', { callId: call.id, to: peerId, signal: { sdp: pc.localDescription } });
    }
  }

  async function handleSignal(peerId, signal) {
    let entry = pcs.current.get(peerId);
    if (!entry) {
      await connectPeer(peerId, false);
      entry = pcs.current.get(peerId);
    }
    const { pc } = entry;
    try {
      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emitRealtime('call.signal', { callId: call.id, to: peerId, signal: { sdp: pc.localDescription } });
        }
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch {}
  }

  function dropPeer(peerId) {
    try {
      pcs.current.get(peerId)?.pc.close();
    } catch {}
    pcs.current.delete(peerId);
    remotes.current.delete(peerId);
    force((n) => n + 1);
  }

  function teardown() {
    pcs.current.forEach(({ pc }) => {
      try {
        pc.close();
      } catch {}
    });
    pcs.current.clear();
    remotes.current.clear();
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
  }

  async function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
    try {
      await setMedia({ muted: next });
    } catch {}
  }

  async function toggleCam() {
    try {
      if (camOff) {
        const stream = streamRef.current || await navigator.mediaDevices.getUserMedia({ audio: true });
        const video = await navigator.mediaDevices.getUserMedia({ video: true });
        video.getVideoTracks().forEach((t) => stream.addTrack(t));
        streamRef.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        // Renegotiate with peers.
        for (const [peerId, { pc }] of pcs.current) {
          video.getVideoTracks().forEach((t) => pc.addTrack(t, stream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          emitRealtime('call.signal', { callId: call.id, to: peerId, signal: { sdp: pc.localDescription } });
        }
        setCamOff(false);
        await setMedia({ cameraOff: false });
      } else {
        streamRef.current?.getVideoTracks().forEach((t) => { t.stop(); streamRef.current.removeTrack(t); });
        if (localVideo.current) localVideo.current.srcObject = streamRef.current;
        setCamOff(true);
        await setMedia({ cameraOff: true });
      }
    } catch {
      setFailed('Camera unavailable.');
    }
  }

  async function toggleShare() {
    try {
      if (!sharing) {
        const disp = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = disp.getVideoTracks()[0];
        for (const [, { pc }] of pcs.current) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(track);
          else if (streamRef.current) pc.addTrack(track, streamRef.current);
        }
        track.onended = () => toggleShare().catch(() => {});
        setSharing(true);
        await setMedia({ sharing: true });
      } else {
        setSharing(false);
        await setMedia({ sharing: false }).catch(() => {});
      }
    } catch {}
  }

  if (!call) return null;
  const isStarter = call.createdBy === myId;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-gray-900 text-white">
      <div className="px-4 py-2 flex items-center gap-3 overflow-x-auto">
        <span className="text-xs font-bold text-green-400 shrink-0">● HUDDLE</span>
        <span className="text-xs text-white/60 shrink-0">{roster.length} in call</span>
        {failed ? <span className="text-xs text-yellow-300">{failed}</span> : null}
        <div className="flex items-center gap-2">
          {others.map((p) => (
            <RemoteTile key={p.userId} peerId={p.userId} name={p.displayName} stream={remotes.current.get(p.userId)} muted={p.muted} />
          ))}
          <div className="flex flex-col items-center gap-1">
            {!camOff ? <video ref={localVideo} autoPlay muted playsInline className="w-24 h-16 rounded bg-black object-cover" /> : (
              <div className="w-10 h-10 rounded-full bg-[#4A154B] flex items-center justify-center font-bold">
                {(user.displayName || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-[10px] text-white/60">You{muted ? ' (muted)' : ''}</span>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} className={`px-3 py-1.5 rounded-full text-sm ${muted ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'}`}>
          {muted ? '🔇' : '🎙️'}
        </button>
        <button onClick={toggleCam} title="Camera" className={`px-3 py-1.5 rounded-full text-sm ${!camOff ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>📷</button>
        <button onClick={toggleShare} title="Share screen" className={`px-3 py-1.5 rounded-full text-sm ${sharing ? 'bg-green-600' : 'bg-white/10 hover:bg-white/20'}`}>🖥️</button>
        {isStarter ? <button onClick={end} title="End for all" className="px-3 py-1.5 rounded-full text-sm bg-red-700 hover:bg-red-600">End</button> : null}
        <button onClick={leave} title="Leave" className="px-3 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20">Leave</button>
      </div>
    </div>
  );
}

function RemoteTile({ name, stream, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="flex flex-col items-center gap-1">
      {stream ? <video ref={ref} autoPlay playsInline className="w-24 h-16 rounded bg-black object-cover" /> : (
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
          {(name || '?').slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="text-[10px] text-white/60 truncate max-w-20">{name}{muted ? ' (muted)' : ''}</span>
    </div>
  );
}
