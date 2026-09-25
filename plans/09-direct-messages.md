# 09 — Direct Messages (1-1 + Group)

Source: document.md §3, §18 Phase 9.

## Objective
DMs reusing messaging/realtime/files stack with read receipts + typing.

## Prerequisites
- Phases 05–07.

## Tasks
### Backend `modules/direct-messages` (Express `.js`)
- [ ] Tables: `direct_conversations(id, workspace_id, is_group, name NULL, created_by, created_at)`, `direct_conversation_members(conversation_id, user_id, last_read_at, joined_at, PK(...))`; messages reuse `messages` with `channel_id NULL + dm_conversation_id` (or separate FK — decide, document it)
- [ ] Endpoints: `POST /dms` {userIds, name?} (idempotent for same 1-1 pair), `GET /dms` (mine with last message + unread), `GET /dms/:id/messages`, `POST /dms/:id/messages`, `POST /dms/:id/read`, `PATCH /dms/:id` (group name), member add/remove; WS rooms `dm:{id}`, events `dm.message.created|updated|deleted, dm.typing, dm.read`
- [ ] Notifications: every DM → `notification.created` + badge; read receipts (who read up to X)

### Desktop `features/direct-messages` (ReactJS `.jsx`)
- [ ] DM list (§3 mock: Amir/John/Sarah/Dev Team) with presence dots, group creation, DM pane = channel pane variant, read ticks

### Tests
- [ ] 1-1 idempotency; non-member blocked; group add/remove; read receipts advance; offline DM notifies on reconnect

## Acceptance
- [ ] 1-1 + group DMs with history/typing/receipts/attachments/reactions all live
