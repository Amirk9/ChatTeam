import { authed } from './api.js';

export const messageApi = {
  list: (channelId, { limit = 30, before } = {}) => {
    const q = new URLSearchParams({ limit: String(limit), ...(before ? { before } : {}) });
    return authed(`/channels/${channelId}/messages?${q}`);
  },
  send: (channelId, input) => authed(`/channels/${channelId}/messages`, { method: 'POST', body: input }).then((d) => d.message),
  thread: (id) => authed(`/messages/${id}/thread`),
  edit: (id, content) => authed(`/messages/${id}`, { method: 'PATCH', body: { content } }).then((d) => d.message),
  remove: (id) => authed(`/messages/${id}`, { method: 'DELETE' }),
  react: (id, emoji) => authed(`/messages/${id}/reactions`, { method: 'POST', body: { emoji } }).then((d) => d.message),
  unreact: (id, emoji) => authed(`/messages/${id}/reactions?emoji=${encodeURIComponent(emoji)}`, { method: 'DELETE' }).then((d) => d.message),
  markRead: (channelId, lastReadMessageId) => authed(`/channels/${channelId}/read`, { method: 'POST', body: { lastReadMessageId } }),
};
