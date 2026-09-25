import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth.store.jsx';
import { callsApi } from '../services/calls.js';
import { onRealtime, emitRealtime } from '../services/socket.js';

const CallContext = createContext(null);

// Huddle state: active call meta + roster. Media/WebRTC lives in CallBar;
// this store owns REST + roster sync + live call.* events.
export function CallProvider({ children }) {
  const { user } = useAuth();
  const [call, setCall] = useState(null);
  const [roster, setRoster] = useState([]);
  const callRef = useRef(null);
  callRef.current = call;

  const refresh = useCallback(async (callId) => {
    const id = callId || callRef.current?.id;
    if (!id) return null;
    try {
      const full = await callsApi.get(id);
      setCall(full);
      setRoster(full.participants || []);
      return full;
    } catch {
      return null;
    }
  }, []);

  const join = useCallback(async (workspaceId, target) => {
    const full = await callsApi.start(workspaceId, target);
    setCall(full);
    setRoster(full.participants || []);
    emitRealtime('call.join', { callId: full.id });
    return full;
  }, []);

  const leave = useCallback(async () => {
    const id = callRef.current?.id;
    if (!id) return;
    emitRealtime('call.leave', { callId: id });
    try {
      await callsApi.leave(id);
    } catch {}
    setCall(null);
    setRoster([]);
  }, []);

  const end = useCallback(async () => {
    const id = callRef.current?.id;
    if (!id) return;
    try {
      await callsApi.end(id);
    } catch {}
    setCall(null);
    setRoster([]);
  }, []);

  const setMedia = useCallback(async (patch) => {
    const id = callRef.current?.id;
    if (!id) return null;
    const full = await callsApi.media(id, patch);
    setRoster(full.participants || []);
    return full;
  }, []);

  useEffect(() => {
    const offs = [
      onRealtime('call.joined', ({ callId, roster: r }) => {
        if (callRef.current?.id === callId && r) setRoster(r);
      }),
      onRealtime('call.left', ({ callId, roster: r }) => {
        if (callRef.current?.id === callId && r) setRoster(r);
      }),
      onRealtime('call.media', ({ callId, roster: r }) => {
        if (callRef.current?.id === callId && r) setRoster(r);
      }),
      onRealtime('call.ended', ({ callId }) => {
        if (callRef.current?.id === callId) {
          setCall(null);
          setRoster([]);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <CallContext.Provider value={{ call, roster, myId: user?.id, join, leave, end, setMedia, refresh }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}
