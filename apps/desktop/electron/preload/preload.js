import { contextBridge, ipcRenderer } from 'electron';

// Secure bridge only — no raw Node/Electron in React.
contextBridge.exposeInMainWorld('teamchat', {
  version: '0.1.0',
  inApp: true,
  system: {
    ping: () => ipcRenderer.invoke('system:ping'),
    version: () => ipcRenderer.invoke('system:version'),
    logsTail: (lines) => ipcRenderer.invoke('logs:tail', { lines }).catch(() => ({ lines: [] })),
    logsReveal: () => ipcRenderer.invoke('logs:reveal').catch(() => ({})),
    logsWrite: (level, message) => ipcRenderer.invoke('logs:write', { level, message }).catch(() => ({})),
    getConfig: () => ipcRenderer.invoke('config:get').catch(() => null),
    setConfig: (patch) => ipcRenderer.invoke('config:set', patch || {}),
    checkUpdates: () => ipcRenderer.invoke('updates:check').catch(() => ({ available: false })),
    setBadge: (count) => ipcRenderer.invoke('notifications:badge', { count }).catch(() => ({})),
    onUpdate: (cb) => {
      const fn = (_e, info) => cb?.(info);
      ipcRenderer.on('teamchat:update', fn);
      return () => ipcRenderer.removeListener('teamchat:update', fn);
    },
  },
  auth: {
    // Phase 10: refresh token lives in OS keychain (safeStorage).
    login: (refresh) => ipcRenderer.invoke('auth:login', { refresh }),
    logout: () => ipcRenderer.invoke('auth:logout').catch(() => ({})),
    getSession: () => ipcRenderer.invoke('auth:getSession').catch(() => null),
  },
  files: {
    // Native dialogs in Electron; browser builds use <input type=file> fallback.
    open: (opts) => ipcRenderer.invoke('files:open', opts || {}).catch(() => []),
    save: (filename) => ipcRenderer.invoke('files:save', { filename }).catch(() => null),
    write: (filePath, base64) => ipcRenderer.invoke('files:write', { filePath, base64 }),
  },
  deepLink: {
    on: (cb) => {
      const fn = (_e, link) => cb?.(link);
      ipcRenderer.on('teamchat:deep-link', fn);
      return () => ipcRenderer.removeListener('teamchat:deep-link', fn);
    },
  },
});
