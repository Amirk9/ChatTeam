// IPC handlers registered by main.js (Phase 1: system only).
// Phase 2: auth.ipc.js (login/logout/getSession + safeStorage)
// Phase 7: file.ipc.js (open/save dialogs)
// Phase 8+: window/notification ipc extensions.
export const IPC_CHANNELS = Object.freeze(['system:ping', 'system:version', 'files:open', 'files:save', 'files:write']);
