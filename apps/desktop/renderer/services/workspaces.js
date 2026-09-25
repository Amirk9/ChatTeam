import { authed } from './api.js';

export const workspaceApi = {
  list: () => authed('/workspaces').then((d) => d.workspaces),
  create: (input) => authed('/workspaces', { method: 'POST', body: input }).then((d) => d.workspace),
  get: (id) => authed(`/workspaces/${id}`).then((d) => d.workspace),
  patch: (id, patch) => authed(`/workspaces/${id}`, { method: 'PATCH', body: patch }).then((d) => d.workspace),
  remove: (id) => authed(`/workspaces/${id}`, { method: 'DELETE' }),
  invite: (id, input) => authed(`/workspaces/${id}/invites`, { method: 'POST', body: input }).then((d) => d.invite),
  join: (token) => authed('/workspaces/join', { method: 'POST', body: { token } }).then((d) => d.workspace),
  members: (id) => authed(`/workspaces/${id}/members`).then((d) => d.members),
  setRole: (id, userId, role) => authed(`/workspaces/${id}/members/${userId}`, { method: 'PATCH', body: { role } }),
  removeMember: (id, userId) => authed(`/workspaces/${id}/members/${userId}`, { method: 'DELETE' }),
  switchTo: (id) => authed(`/workspaces/${id}/switch`, { method: 'POST' }).then((d) => d.workspace),
};
