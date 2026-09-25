import React, { createContext, useCallback, useContext, useState } from 'react';
import { dmApi } from '../services/dms.js';

const DMContext = createContext(null);

// DM feed state mirrors the channel message store but keyed by conversation id:
// byDm[dmId] = { messages, nextCursor }. Unread badges come from the list.
export function DMProvider({ children }) {
  const [dms, setDms] = useState([]);
  const [currentDmId, setCurrentDmId] = useState(null);
  const [byDm, setByDm] = useState({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (workspaceId) => {
    if (!workspaceId) {
      setDms([]);
      setCurrentDmId(null);
      return [];
    }
    setLoading(true);
    try {
      const list = await dmApi.list(workspaceId);
      setDms(list);
      setCurrentDmId((prev) => (prev && list.some((d) => d.id === prev) ? prev : null));
      return list;
    } finally {
      setLoading(false);
    }
  }, []);

  const patchDm = useCallback((convo) => {
    setDms((prev) => {
      const exists = prev.some((d) => d.id === convo.id);
      const merged = exists ? prev.map((d) => (d.id === convo.id ? { ...d, ...convo } : d)) : [...prev, convo];
      return merged.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    });
  }, []);

  const removeDm = useCallback((id) => {
    setDms((prev) => prev.filter((d) => d.id !== id));
    setCurrentDmId((prev) => (prev === id ? null : prev));
  }, []);

  const patchMessage = useCallback((dmId, msg) => {
    setByDm((prev) => {
      const feed = prev[dmId] || { messages: [], nextCursor: null };
      const exists = feed.messages.some((m) => m.id === msg.id);
      return {
        ...prev,
        [dmId]: {
          ...feed,
          messages: exists ? feed.messages.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)) : [...feed.messages, msg],
        },
      };
    });
  }, []);

  const patchReaction = useCallback((dmId, messageId, emoji, userId, delta, myId) => {
    setByDm((prev) => {
      const feed = prev[dmId];
      if (!feed) return prev;
      return {
        ...prev,
        [dmId]: {
          ...feed,
          messages: feed.messages.map((m) => {
            if (m.id !== messageId) return m;
            const found = (m.reactions || []).find((r) => r.emoji === emoji);
            let reactions;
            if (found) {
              const count = found.count + delta;
              reactions = count <= 0
                ? m.reactions.filter((r) => r.emoji !== emoji)
                : m.reactions.map((r) => (r.emoji === emoji ? { ...r, count, me: userId === myId ? delta > 0 : r.me } : r));
            } else if (delta > 0) {
              reactions = [...(m.reactions || []), { emoji, count: 1, me: userId === myId }];
            } else {
              reactions = m.reactions;
            }
            return { ...m, reactions };
          }),
        },
      };
    });
  }, []);

  const load = useCallback(async (dmId, before) => {
    const data = await dmApi.listMessages(dmId, before ? { before } : {});
    setByDm((prev) => {
      const feed = prev[dmId] || { messages: [], nextCursor: null };
      const known = new Set(feed.messages.map((m) => m.id));
      const fresh = data.messages.filter((m) => !known.has(m.id));
      return {
        ...prev,
        [dmId]: {
          messages: before ? [...fresh, ...feed.messages] : data.messages,
          nextCursor: data.nextCursor,
        },
      };
    });
    return data;
  }, []);

  const send = useCallback(async (dmId, input) => {
    const msg = await dmApi.send(dmId, input);
    if (!input.parentMessageId) patchMessage(dmId, msg);
    return msg;
  }, [patchMessage]);

  const current = dms.find((d) => d.id === currentDmId) || null;
  const totalUnread = dms.reduce((n, d) => n + (d.unreadCount || 0), 0);

  return (
    <DMContext.Provider value={{
      dms, current, currentDmId, loading, totalUnread, byDm,
      refresh, select: setCurrentDmId, patchDm, removeDm,
      patchMessage, patchReaction, load, send,
    }}>
      {children}
    </DMContext.Provider>
  );
}

export function useDMs() {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error('useDMs must be used inside DMProvider');
  return ctx;
}
