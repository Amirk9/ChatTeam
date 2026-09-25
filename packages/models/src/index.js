/**
 * Data-shape reference via JSDoc (no TypeScript).
 * These typedefs document the JSON contracts used by REST + WebSocket.
 *
 * @typedef {object} User
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {string|null} avatarUrl
 * @property {string} status
 * @property {string|null} customStatus
 * @property {string|null} timezone
 *
 * @typedef {object} Workspace
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 *
 * @typedef {object} Channel
 * @property {string} id
 * @property {string} workspaceId
 * @property {string} name
 * @property {boolean} isPrivate
 * @property {boolean} isArchived
 *
 * @typedef {object} Message
 * @property {string} id
 * @property {string} workspaceId
 * @property {string|null} channelId
 * @property {string|null} parentMessageId
 * @property {string} senderId
 * @property {string} content
 * @property {'text'|'system'|'bot'} messageType
 * @property {string} createdAt
 *
 * @typedef {object} WsEvent
 * @property {string} type
 * @property {object} payload
 */

export const __models = true;
