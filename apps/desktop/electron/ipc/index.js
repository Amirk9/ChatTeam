// IPC channels registered by main.js (Phase 10 surface).
// auth.* persists refresh tokens in OS keychain (safeStorage).
// system.* exposes version/logs/config/updates/badge (validated in main).
export const IPC_CHANNELS = Object.freeze([
  'system:ping',
  'system:version',
  'logs:tail',
  'logs:reveal',
  'logs:write',
  'config:get',
  'config:set',
  'updates:check',
  'notifications:badge',
  'auth:login',
  'auth:getSession',
  'auth:logout',
  'files:open',
  'files:save',
  'files:write',
]);
