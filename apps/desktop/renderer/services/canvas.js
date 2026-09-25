import { authed } from './api.js';

export const canvasApi = {
  list: (workspaceId) => authed(`/workspaces/${workspaceId}/canvas`).then((d) => d.canvas),
  create: (workspaceId, input) => authed(`/workspaces/${workspaceId}/canvas`, { method: 'POST', body: input }).then((d) => d.canvas),
  get: (id) => authed(`/canvas/${id}`),
  rename: (id, title) => authed(`/canvas/${id}`, { method: 'PATCH', body: { title } }).then((d) => d.canvas),
  remove: (id) => authed(`/canvas/${id}`, { method: 'DELETE' }),
  saveBlocks: (id, blocks) => authed(`/canvas/${id}/blocks`, { method: 'PUT', body: { blocks } }),
  comment: (id, input) => authed(`/canvas/${id}/comments`, { method: 'POST', body: input }).then((d) => d.comment),
};
