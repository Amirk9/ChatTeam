// JSDoc for the preload bridge (no TypeScript).
/**
 * @typedef {object} TeamChatBridge
 * @property {string} version
 * @property {boolean} inApp
 * @property {{ping: () => Promise<string>, version: () => Promise<object>, logsTail: (lines?: number) => Promise<object>, logsReveal: () => Promise<object>, logsWrite: (level: string, message: string) => Promise<object>, getConfig: () => Promise<object|null>, setConfig: (patch: object) => Promise<object>, checkUpdates: () => Promise<object>, setBadge: (count: number) => Promise<object>, onUpdate: (cb: (info: object) => void) => () => void}} system
 * @property {{login: (refresh: string) => Promise<object>, logout: () => Promise<object>, getSession: () => Promise<{refresh: string, secure: boolean}|null>}} auth
 * @property {{open: (opts?: object) => Promise<Array>, save: (filename: string) => Promise<string|null>, write: (filePath: string, base64: string) => Promise<object>}} files
 * @property {{on: (cb: (link: {kind: string, value: string, url: string}) => void) => () => void}} deepLink
 */
export const __bridge = true;
