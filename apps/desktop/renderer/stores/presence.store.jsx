import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth.store.jsx';
import { useMessages } from './message.store.jsx';
import { useChannels } from './channel.store.jsx';
import { useWorkspace } from './workspace.store.jsx';
import {
  connectRealtime,
  disconnectRealtime,
  onRealtime,
  requestPresence,
  heartbeat,
  emitRealtime,
} from '../services/socket.js';
import { authApi } from '../services/api.js';

const PresenceContext = createContext(null);

function beep(enabled) {
  if (!enabled) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.start();
    o.stop(ctx.currentTime + 0.15);
  } catch {}
}

export function PresenceProvider({ children }) {
  const { user } = useAuth();
  const { current: workspace } = useWorkspace();
  const { patchMessage, patchReaction, refreshThread, threadRootId } = useMessages();
  const { refresh: refreshChannels } = useChannels();
  const [presence, setPresence] = useState({});
  const [typing, setTyping] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [sound, setSound] = useState(() => localStorage.getItem('tc_sound') !== 'off');
  const badgeTimer = useRef(null);

  const toggleSound = useCallback(() => {
    setSound((s) => {
      localStorage.setItem('tc_sound', s ? 'off' : 'on');
      return !s;
    });
  }, []);

  const refreshBadges = useCallback(() => {
    clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => {
      if (workspace?.id) refreshChannels(workspace.id).catch(() => {});
    }, 800);
  }, [workspace?.id, refreshChannels]);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await authApi.notifications();
      setNotifications(data.notifications);
      setNotifUnread(data.unreadCount);
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await authApi.markNotificationsRead();
      setNotifications((ns) => ns.map((n) => ({ ...n, is_read: true })));
      setNotifUnread(0);
    } catch {}
  }, []);

  // Connect socket on login; join + snapshot on workspace.
  useEffect(() => {
    if (!user) {
      disconnectRealtime();
      return;
    }
    const token = localStorage.getItem('tc_access');
    if (!token) return;
    connectRealtime(token);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    const hb = setInterval(() => heartbeat(), 25000);
    heartbeat();
    return () => {
      clearInterval(hb);
      disconnectRealtime();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !workspace?.id) return;
    requestPresence(workspace.id).then(setPresence).catch(() => {});
    loadNotifications();
  }, [user?.id, workspace?.id, loadNotifications]);

  // Live event wiring.
  useEffect(() => {
    const offs = [
      onRealtime('message.created', ({ message }) => {
        if (!message) return;
        patchMessage(message.channelId, message);
        refreshBadges();
      }),
      onRealtime('message.updated', ({ message }) => {
        if (message) patchMessage(message.channelId, message);
      }),
      onRealtime('message.deleted', ({ id, channelId }) => {
        patchMessage(channelId, { id, channelId, deleted: true, content: null });
        refreshBadges();
        refreshThread();
      }),
      onRealtime('reaction.added', ({ messageId, channelId, emoji, userId }) => {
        patchReaction(channelId, messageId, emoji, userId, 1, user?.id);
        refreshBadges();
      }),
      onRealtime('reaction.removed', ({ messageId, channelId, emoji, userId }) => {
        patchReaction(channelId, messageId, emoji, userId, -1, user?.id);
      }),
      onRealtime('channel.created', refreshBadges),
      onRealtime('channel.updated', refreshBadges),
      onRealtime('channel.archived', refreshBadges),
      onRealtime('channel.deleted', refreshBadges),
      onRealtime('user.typing', ({ channelId, userId, displayName }) => {
        if (userId === user?.id) return;
        setTyping((prev) => ({ ...prev, [channelId]: { ...(prev[channelId] || {}), [userId]: { displayName, at: Date.now() } } }));
        setTimeout(() => {
          setTyping((prev) => {
            const ch = { ...(prev[channelId] || {}) };
            delete ch[userId];
            return { ...prev, [channelId]: ch };
          });
        }, 4500);
      }),
      onRealtime('user.presence_changed', ({ userId, state, workspaceId }) => {
        if (workspaceId !== workspace?.id) return;
        setPresence((prev) => {
          if (state === 'OFFLINE') {
            const next = { ...prev };
            delete next[userId];
            return next;
          }
          return { ...prev, [userId]: { state, at: new Date().toISOString() } };
        });
      }),
      onRealtime('notification.created', (n) => {
        setNotifications((prev) => [{ ...n, is_read: false }, ...prev].slice(0, 50));
        setNotifUnread((c) => c + 1);
        beep(sound);
        if (user?.status !== 'DO_NOT_DISTURB' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('TeamChat', { body: n.type === 'mention' ? 'You were mentioned' : 'New reply in your thread' });
          } catch {}
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [user?.id, workspace?.id, patchMessage, refreshThread, refreshBadges, sound]);

  return (
    <PresenceContext.Provider value={{ presence, typing, notifications, notifUnread, loadNotifications, markAllRead, sound, toggleSound }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('usePresence must be used inside PresenceProvider');
  return ctx;
}

export function typingEmit(channelId, phase) {
  emitRealtime(phase === 'stop' ? 'typing.stop' : 'typing.start', { channelId });
}
