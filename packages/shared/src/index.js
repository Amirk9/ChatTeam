// Shared constants (plain JS).
export const APP_NAME = 'TeamChat';
export const APP_PROTOCOL = 'teamchat://';
export const DEFAULT_CHANNEL = 'general';
export const WS_EVENTS = Object.freeze({
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_DELETED: 'message.deleted',
  REACTION_ADDED: 'reaction.added',
  REACTION_REMOVED: 'reaction.removed',
  CHANNEL_CREATED: 'channel.created',
  CHANNEL_UPDATED: 'channel.updated',
  USER_TYPING: 'user.typing',
  PRESENCE_CHANGED: 'user.presence_changed',
});
export const PRESENCE = Object.freeze(['ONLINE', 'AWAY', 'OFFLINE', 'DO_NOT_DISTURB']);
export const ROLES = Object.freeze(['owner', 'admin', 'moderator', 'member', 'guest', 'bot']);
export const PERMISSIONS = Object.freeze([
  'CREATE_CHANNEL',
  'DELETE_CHANNEL',
  'INVITE_MEMBER',
  'REMOVE_MEMBER',
  'MANAGE_WORKSPACE',
  'MANAGE_INTEGRATIONS',
  'DELETE_MESSAGE',
  'MANAGE_ROLES',
  'VIEW_AUDIT_LOG',
]);
