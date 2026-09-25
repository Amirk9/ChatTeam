import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth.store.jsx';
import { workspaceApi } from '../services/workspaces.js';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [currentId, setCurrentId] = useState(() => localStorage.getItem('tc_workspace') || null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return [];
    }
    setLoading(true);
    try {
      const list = await workspaceApi.list();
      setWorkspaces(list);
      if (!list.find((w) => w.id === currentId)) {
        const first = list[0]?.id || null;
        setCurrentId(first);
        if (first) localStorage.setItem('tc_workspace', first);
        else localStorage.removeItem('tc_workspace');
      }
      return list;
    } finally {
      setLoading(false);
    }
  }, [user, currentId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const switchTo = useCallback(async (id) => {
    await workspaceApi.switchTo(id);
    setCurrentId(id);
    localStorage.setItem('tc_workspace', id);
  }, []);

  const current = workspaces.find((w) => w.id === currentId) || null;

  return (
    <WorkspaceContext.Provider value={{ workspaces, current, currentId, loading, refresh, switchTo }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
