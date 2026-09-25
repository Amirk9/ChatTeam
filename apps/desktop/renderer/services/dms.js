import { authed } from './api.js';

export const dmApi = {
  list: (workspaceId) => authed(`/workspaces/${workspaceId}/dms`).then((d) => d.conversations),
  create: (workspaceId, { userIds, name }) =>
    authed(`/workspaces/${workspaceId}/dms`, { method: 'POST', body: { userIds, ...(name ? { name } : {}) } }).then((d) => d.conversation),
  get: (id) => authed(`/dms/${id}`).then((d) => d.conversation),
  members: (id) => authed(`/dms/${id}/members`).then((d) => d.members),
  rename: (id, name) => authed(`/dms/${id}`, { method: 'PATCH', body: { name } }).then((d) => d.conversation),
  addMember: (id, userId) => authed(`/dms/${id}/members`, { method: 'POST', body: { userId } }).then((d) => d.conversation),
  removeMember: (id, userId) => authed(`/dms/${id}/members/${userId}`, { method: 'DELETE' }).then((d) => d.conversation),
  listMessages: (id, { limit = 30, before } = {}) => {
    const q = new URLSearchParams({ limit: String(limit), ...(before ? { before } : {}) });
    return authed(`/dms/${id}/messages?${q}`);
  },
  send: (id, input) => authed(`/dms/${id}/messages`, { method: 'POST', body: input }).then((d) => d.message),
  markRead: (id, lastReadMessageId) => authed(`/dms/${id}/read`, { method: 'POST', body: { lastReadMessageId } }),
};
