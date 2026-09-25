import { authed } from './api.js';

export const channelApi = {
  list: (wid) => authed(`/workspaces/${wid}/channels`).then((d) => d.channels),
  create: (wid, input) => authed(`/workspaces/${wid}/channels`, { method: 'POST', body: input }).then((d) => d.channel),
  get: (id) => authed(`/channels/${id}`).then((d) => d.channel),
  patch: (id, patch) => authed(`/channels/${id}`, { method: 'PATCH', body: patch }).then((d) => d.channel),
  join: (id) => authed(`/channels/${id}/join`, { method: 'POST' }),
  leave: (id) => authed(`/channels/${id}/leave`, { method: 'POST' }),
  archive: (id) => authed(`/channels/${id}/archive`, { method: 'POST' }),
  unarchive: (id) => authed(`/channels/${id}/unarchive`, { method: 'POST' }),
  remove: (id) => authed(`/channels/${id}`, { method: 'DELETE' }),
  members: (id) => authed(`/channels/${id}/members`).then((d) => d.members),
  addMember: (id, userId) => authed(`/channels/${id}/members`, { method: 'POST', body: { userId } }),
};
