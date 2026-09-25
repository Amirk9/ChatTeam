import { authed } from './api.js';

export const botsApi = {
  list: (workspaceId) => authed(`/workspaces/${workspaceId}/bots`).then((d) => d.bots),
  create: (workspaceId, name) => authed(`/workspaces/${workspaceId}/bots`, { method: 'POST', body: { name } }),
  addCommand: (botId, cmd) => authed(`/bots/${botId}/commands`, { method: 'POST', body: cmd }).then((d) => d.command),
  click: (messageId, action) => authed('/bots/callbacks', { method: 'POST', body: { messageId, action } }),
};

export const integrationsApi = {
  list: (workspaceId) => authed(`/workspaces/${workspaceId}/integrations`).then((d) => d.integrations),
  create: (workspaceId, input) => authed(`/workspaces/${workspaceId}/integrations`, { method: 'POST', body: input }),
  remove: (id) => authed(`/integrations/${id}`, { method: 'DELETE' }),
  subscribe: (id, input) => authed(`/integrations/${id}/subscriptions`, { method: 'POST', body: input }).then((d) => d.subscription),
};

export const workflowsApi = {
  list: (workspaceId) => authed(`/workspaces/${workspaceId}/workflows`).then((d) => d.workflows),
  create: (workspaceId, input) => authed(`/workspaces/${workspaceId}/workflows`, { method: 'POST', body: input }).then((d) => d.workflow),
  run: (id, inputs) => authed(`/workflows/${id}/run`, { method: 'POST', body: { inputs: inputs || {} } }),
  onboarding: (input) => authed('/workflows/templates/onboarding', { method: 'POST', body: input }),
};

export const adminApi = {
  users: (workspaceId) => authed(`/admin/users?workspaceId=${workspaceId}`).then((d) => d.users),
  sessions: (workspaceId) => authed(`/admin/sessions?workspaceId=${workspaceId}`).then((d) => d.sessions),
  audit: (workspaceId) => authed(`/admin/audit?workspaceId=${workspaceId}`).then((d) => d.audit),
  usage: (workspaceId) => authed(`/admin/usage?workspaceId=${workspaceId}`).then((d) => d.usage),
};
