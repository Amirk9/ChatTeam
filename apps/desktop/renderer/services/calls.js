import { authed } from './api.js';

export const callsApi = {
  start: (workspaceId, target) => authed(`/workspaces/${workspaceId}/calls`, { method: 'POST', body: target }).then((d) => d.call),
  active: (workspaceId) => authed(`/calls/active?workspaceId=${workspaceId}`).then((d) => d.calls),
  get: (id) => authed(`/calls/${id}`).then((d) => d.call),
  media: (id, patch) => authed(`/calls/${id}/media`, { method: 'POST', body: patch }).then((d) => d.call),
  leave: (id) => authed(`/calls/${id}/leave`, { method: 'POST' }),
  end: (id) => authed(`/calls/${id}/end`, { method: 'POST' }),
};
