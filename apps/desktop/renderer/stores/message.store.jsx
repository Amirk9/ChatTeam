import React, { createContext, useCallback, useContext, useState } from 'react';
import { messageApi } from '../services/messages.js';

const MessageContext = createContext(null);

// Per-channel feed state: messages (chronological), cursor, thread pane.
export function MessageProvider({ children }) {
  const [byChannel, setByChannel] = useState({});
  const [threadRootId, setThreadRootId] = useState(null);
  const [thread, setThread] = useState(null);

  // Live-merge a reaction delta from WS events (Slack instant reactions).
  const patchReaction = useCallback((channelId, messageId, emoji, userId, delta, myId) => {
    setByChannel((prev) => {
      const feed = prev[channelId];
      if (!feed) return prev;
      return {
        ...prev,
        [channelId]: {
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

  const patchMessage = useCallback((channelId, msg) => {
    setByChannel((prev) => {
      const feed = prev[channelId] || { messages: [], nextCursor: null };
      const exists = feed.messages.some((m) => m.id === msg.id);
      return {
        ...prev,
        [channelId]: {
          ...feed,
          messages: exists ? feed.messages.map((m) => (m.id === msg.id ? msg : m)) : [...feed.messages, msg],
        },
      };
    });
  }, []);

  const load = useCallback(async (channelId, before) => {
    const data = await messageApi.list(channelId, before ? { before } : {});
    setByChannel((prev) => {
      const feed = prev[channelId] || { messages: [], nextCursor: null };
      const known = new Set(feed.messages.map((m) => m.id));
      const fresh = data.messages.filter((m) => !known.has(m.id));
      return {
        ...prev,
        [channelId]: {
          messages: before ? [...fresh, ...feed.messages] : data.messages,
          nextCursor: data.nextCursor,
        },
      };
    });
    return data;
  }, []);

  const send = useCallback(async (channelId, input) => {
    const msg = await messageApi.send(channelId, input);
    if (!input.parentMessageId) patchMessage(channelId, msg);
    return msg;
  }, [patchMessage]);

  const openThread = useCallback(async (channelId, rootId) => {
    setThreadRootId(rootId);
    const data = await messageApi.thread(rootId);
    setThread({ ...data, channelId });
    return data;
  }, []);

  const closeThread = useCallback(() => {
    setThreadRootId(null);
    setThread(null);
  }, []);

  const refreshThread = useCallback(async () => {
    if (!threadRootId) return;
    const data = await messageApi.thread(threadRootId);
    setThread((prev) => ({ ...data, channelId: prev?.channelId }));
  }, [threadRootId]);

  return (
    <MessageContext.Provider value={{ byChannel, load, send, patchMessage, patchReaction, threadRootId, thread, openThread, closeThread, refreshThread }}>
      {children}
    </MessageContext.Provider>
  );
}

export function useMessages() {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error('useMessages must be used inside MessageProvider');
  return ctx;
}
