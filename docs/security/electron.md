# Electron security (Phase 1)
- contextIsolation ON, sandbox ON, nodeIntegration OFF.
- Renderer talks only to `window.teamchat` (contextBridge).
- All IPC validated with zod. No raw Node/Electron in React.
