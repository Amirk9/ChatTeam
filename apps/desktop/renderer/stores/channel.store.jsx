import React, { createContext, useCallback, useContext, useState } from 'react';
import { channelApi } from '../services/channels.js';

const ChannelContext = createContext(null);

export function ChannelProvider({ children }) {
  const [channels, setChannels] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (workspaceId) => {
    if (!workspaceId) {
      setChannels([]);
      setCurrentId(null);
      return [];
    }
    setLoading(true);
    try {
      const list = await channelApi.list(workspaceId);
      setChannels(list);
      setCurrentId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list.find((c) => c.slug === 'general')?.id || list[0]?.id || null;
      });
      return list;
    } finally {
      setLoading(false);
    }
  }, []);

  const current = channels.find((c) => c.id === currentId) || null;

  const selectAndRefresh = useCallback(async (workspaceId, id) => {
    setCurrentId(id);
  }, []);

  return (
    <ChannelContext.Provider value={{ channels, current, currentId, loading, refresh, select: selectAndRefresh }}>
      {children}
    </ChannelContext.Provider>
  );
}

export function useChannels() {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannels must be used inside ChannelProvider');
  return ctx;
}
