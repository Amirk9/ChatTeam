# 04 — Channels

Source: document.md §2 (Channels block), §18 Phase 4.

## Objective
Public/private channels with full lifecycle + membership + permissions.

## Prerequisites
- Phase 03 (workspace + RBAC).

## Tasks
### Backend `modules/channels` (Express `.js`)
- [ ] Tables: `channels(id, workspace_id FK, name (unique per workspace), slug, description, topic, is_private, is_archived, created_by, created_at, updated_at)`, `channel_members(channel_id, user_id, role, joined_at, last_read_at, PK(channel_id,user_id))`
- [ ] Endpoints: `POST /workspaces/:wid/channels` (CREATE_CHANNEL), `GET /workspaces/:wid/channels` (auto-filter private non-members), `GET/PATCH /channels/:id` (rename/desc/topic, MANAGE or creator), `POST /channels/:id/join` (public or invite; private needs INVITE_MEMBER), `POST /channels/:id/leave`, `POST /channels/:id/archive|unarchive`, `GET /channels/:id/members`, `POST /channels/:id/members`, `DELETE /channels/:id/members/:uid`, `DELETE /channels/:id` (DELETE_CHANNEL)
- [ ] Auto-join `#general`; private channels invisible to non-members (also in search); audit logs

### Desktop `features/channels + stores/channel.store.js` (ReactJS)
- [ ] Sidebar channel list (unread badges stub → Phase 06), create/join/browse dialogs, rename/description/archive UI, members drawer, join/leave buttons

### Tests
- [ ] Private-channel invisibility; archived read-only; rename slug collision; non-member blocked from private history

## Acceptance
- [ ] Create public/private → join/leave → rename → archive → delete cycle clean; permissions enforced
