import { contextBridge, ipcRenderer } from 'electron';

// Secure bridge only — no raw Node/Electron in React.
contextBridge.exposeInMainWorld('teamchat', {
  version: '0.1.0',
  system: {
    ping: () => ipcRenderer.invoke('system:ping'),
    version: () => ipcRenderer.invoke('system:version'),
  },
  auth: {
    // Phase 2 implements login/logout/getSession
    getSession: () => ipcRenderer.invoke('auth:getSession').catch(() => null),
  },
  files: {
    // Native dialogs in Electron; browser builds use <input type=file> fallback.
    open: (opts) => ipcRenderer.invoke('files:open', opts || {}).catch(() => []),
    save: (filename) => ipcRenderer.invoke('files:save', { filename }).catch(() => null),
    write: (filePath, base64) => ipcRenderer.invoke('files:write', { filePath, base64 }),
  },
});
