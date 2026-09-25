// Socket.IO realtime client: auto-reconnect w/ backoff, typed handler registry.
// Server envelope: { type, payload } on the 'event' channel.
import { io } from 'socket.io-client';

let socket = null;
const handlers = new Map(); // type -> Set<cb>

function dispatch(ev) {
  if (!ev || !ev.type) return;
  const set = handlers.get(ev.type);
  if (set) for (const cb of [...set]) {
    try {
      cb(ev.payload);
    } catch {}
  }
}

export function connectRealtime(token) {
  disconnectRealtime();
  const base = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  socket = io(base, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  socket.on('event', dispatch);
  socket.on('connect', () => heartbeat());
  return socket;
}

export function disconnectRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function onRealtime(type, cb) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(cb);
  return () => handlers.get(type)?.delete(cb);
}

export function emitRealtime(ev, data) {
  socket?.emit(ev, data || {});
}

export function requestPresence(workspaceId) {
  return new Promise((resolve) => {
    if (!socket) return resolve({});
    socket.emit('presence.list', { workspaceId }, (snap) => resolve(snap || {}));
  });
}

export function heartbeat(status) {
  socket?.emit('presence.heartbeat', status ? { status } : {});
}

export function isConnected() {
  return Boolean(socket?.connected);
}

