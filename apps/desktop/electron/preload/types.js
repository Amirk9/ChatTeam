// JSDoc for the preload bridge (no TypeScript).
/**
 * @typedef {object} TeamChatBridge
 * @property {string} version
 * @property {{ping: () => Promise<string>, version: () => Promise<object>}} system
 * @property {{getSession: () => Promise<null>}} auth
 * @property {{open: () => Promise<Array>}} files
 */
export const __bridge = true;
