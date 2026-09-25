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
    // Phase 7 implements open/save dialogs
    open: () => ipcRenderer.invoke('files:open').catch(() => []),
  },
});
