# 06 — Realtime + Presence + Typing + Notifications

Source: document.md §§4,8,9,18 Phase 6, §24.

## Objective
Live delivery: WS fan-out via Redis pub/sub, presence, typing, unread + desktop notifications.

## Prerequisites
- Phases 02–05 (auth, workspace, channels, messages).

## Tasks
### Backend `websocket/ + modules/presence|notifications` (plain JS)
- [ ] WS gateway (Socket.IO in JS): auth handshake (JWT), rooms `workspace:{id} user:{id} channel:{id}`, heartbeat; Redis adapter/pub-sub for multi-instance
- [ ] Publish on write path: validate → save PG → `redis.publish` → fan-out (per §24 flow). Events: `message.created|updated|deleted, reaction.added|removed, channel.created|updated|archived, user.typing (ephemeral, no PG), user.presence_changed, dm.* (stub for Phase 09), notification.created`
- [ ] Presence service: heartbeat 25s → Redis `presence:{wid}:{uid}` TTL 60s; states ONLINE/AWAY/OFFLINE/DND (+ACTIVE/IDLE mapping); `last_seen_at` flush to PG periodically
- [ ] Notifications table: `notifications(id, user_id, workspace_id, type: mention|dm|thread_reply|channel, ref_id, is_read, created_at)`; rules: @mention, thread reply, DM → notify; channel msg → only if subscribed/mentioned; batching to avoid spam
- [ ] Endpoints: `GET /notifications`, `POST /notifications/read`, WS `presence.list`, `typing.start|stop`

### Desktop `services/websocket + stores/presence.store.js + features/notifications` (ReactJS)
- [ ] WS client (auto-reconnect, backoff, resync missed via `GET messages?since`), optimistic send → reconcile, typing dots (debounce 3s), presence dots, unread badges, Electron `Notification` via main (`notification.ipc.js`) respecting DND/focus, sound toggle

### Tests
- [ ] Two-client live test: A sends → B receives <500ms local; typing shows/clears; presence flips on disconnect; offline→reconnect resyncs; mention creates notification+desktop toast

## Acceptance
- [ ] Feels realtime; presence/typing/unread/notifications all live; survives reconnect
