# TeamChat (Slack Clone) — Master Implementation Plan

> Source: `document.md` (1237 lines, 29 sections)
> Workspace: `D:\Documents\myproject2\electron\chat\` — currently contains ONLY `document.md`
> Project decision (2026-09-25): **ReactJS + JavaScript everywhere — NO TypeScript.** Frontend is ReactJS (JSX). Backend is Node.js + JavaScript (Express). This overrides `document.md` where it says TypeScript/NestJS.
> Goal: Build **Option A — Slack-like application** (own backend + DB + realtime), NOT a Slack API client.

## 1. What document.md contains

| # | Section | Summary |
|---|---------|---------|
| 1 | What we build | TeamChat = Electron + ReactJS (JavaScript) + Node.js + WebSocket + REST + PostgreSQL + File Storage, cross-platform (Win/macOS/Linux) |
| 2 | Phase 1 features | Auth, Workspace, Users/Presence, Channels, Messaging (send/edit/delete/reply/threads/mentions/emoji/reactions/markdown/read-unread) |
| 3 | Direct Messages | 1-1 DM, Group DM, history, typing, presence, reactions, replies, attachments, read receipts |
| 4 | Realtime | REST for CRUD (`POST /messages`, `GET /channels`, etc.) + WebSocket for events (`message.created/updated/deleted`, `user.typing`, `user.presence_changed`, `channel.created/updated`, `reaction.added/removed`) |
| 5 | File sharing | Upload/download/preview (image/PDF/video/audio), metadata, permissions. MinIO local → S3-compatible abstraction |
| 6 | Search | Messages/Users/Channels/Files. Syntax `from:`, `in:`, `"phrase"`, later `before:/after:/has:`. Start PG Full-Text Search → later OpenSearch |
| 7 | Threads | Root message + replies (`parent_message_id`) |
| 8 | Notifications | Desktop + mention + DM + thread + channel. Electron main + renderer UI |
| 9 | Presence | ONLINE/AWAY/OFFLINE/DND (+ACTIVE/IDLE). Electron → WS → Presence Service → Redis (online users, typing, sessions) |
| 10 | Voice/Video | Huddles equivalent. WebRTC P2P first, later STUN/TURN/SFU (mediasoup/LiveKit/Janus). Later phase |
| 11 | Canvas | Rich text/images/files/links/checklists/tables/comments. Tiptap/ProseMirror/Lexical + Yjs + WS + CRDT. Later phase |
| 12 | Integrations | GitHub/GitLab/Jira/Drive/M365/Zoom/CI/Monitoring + Custom Webhooks → post to channel |
| 13 | Bots | Bot users, slash commands (`/github`, `/meeting`), webhooks, buttons, modals |
| 14 | Workflows | Trigger → Condition → Action → Result (e.g. onboarding) |
| 15 | Admin panel | Users/Teams/Channels/Roles/Permissions/Audit/Sessions/Devices/Integrations/Storage/Usage/Billing/Policies |
| 16 | Roles/Permissions | Owner/Admin/Moderator/Member/Guest/Bot. Perms: CREATE_CHANNEL, DELETE_CHANNEL, INVITE_MEMBER, REMOVE_MEMBER, MANAGE_WORKSPACE, MANAGE_INTEGRATIONS, DELETE_MESSAGE, MANAGE_ROLES, VIEW_AUDIT_LOG. Enforce in backend, never only UI |
| 17-18 | Architecture + Stack | Desktop: Electron+ReactJS (JS)+Vite. Backend: Node+JS+Express (plain JavaScript, modular). DB: PostgreSQL. Cache: Redis. Realtime: WS/Socket.IO. Storage: MinIO→S3. Auth: JWT+Refresh+Argon2+OAuth2/OIDC. Test: Jest/Vitest/Playwright/Supertest. DevOps: Docker/Compose/GHA |
| 19-21 | Project structures | Monorepo `teamchat/apps/{desktop,web,server} + packages/{shared,models,validation,api-client,ui,config} + infrastructure/docker + docs + scripts`. Detailed Electron main/preload/ipc (`*.js`) + renderer (`*.jsx`) app/components/features/pages/stores/services. Backend module-per-feature in plain JS (auth/users/workspaces/members/channels/messages/threads/reactions/dms/files/search/notifications/presence/integrations/bots/workflows/canvas/calls) |
| 22-23 | DB | Tables: users, workspaces, workspace_members, roles, permissions, channels, channel_members, messages (`id, workspace_id, channel_id, sender_id, parent_message_id, content, message_type, created_at, updated_at, deleted_at`), message_reactions, message_attachments, message_mentions, threads, direct_conversations, direct_conversation_members, files, notifications, sessions, refresh_tokens, integrations, webhooks, audit_logs (+later canvas*, calls*, workflows*, bots*) |
| 24 | Realtime flow | Electron → Backend (validate auth → check perm → save PG → publish Redis Pub/Sub) → fan-out WS. Event example `{type:"message.created", payload:{messageId, channelId, senderId, content}}` |
| 25-26 | Electron security | React --safe API--> Preload (contextBridge) --IPC--> Main --> OS. Never full Node access. `window.teamchat.files.open()` → `ipcMain.handle(...)` |
| 27 | UI target | 3-pane: left Workspace/Channels/DMs, center #channel feed + composer (emoji/attach/mention/link), right Channel info/members, top search/bell/profile |
| 28-29 | Phases + scale | Phase 1 Foundation → 2 Auth → 3 Workspace → 4 Channels → 5 Messaging → 6 Realtime → 7 Files → 8 Search → 9 DMs → 10 Prod Electron → 11 Advanced. Scale path: single server → API Gateway/LB → API xN + Redis + PG + MinIO |

## 2. Implementation order (strict, one-by-one)

Each phase has a file in `plans/` with full task list, API/DB/WS contracts, and acceptance criteria. Do not skip.

| Order | Plan file | Depends on |
|-------|-----------|------------|
| 0 | `plans/00-overview-architecture.md` | — read first |
| 1 | `plans/01-foundation-monorepo.md` | 0 |
| 2 | `plans/02-authentication.md` | 1 |
| 3 | `plans/03-workspace-users-roles.md` | 2 |
| 4 | `plans/04-channels.md` | 3 |
| 5 | `plans/05-messaging-threads.md` | 4 |
| 6 | `plans/06-realtime-presence-notifications.md` | 5 |
| 7 | `plans/07-file-sharing.md` | 6 |
| 8 | `plans/08-search.md` | 7 |
| 9 | `plans/09-direct-messages.md` | 6,7 |
| 10 | `plans/10-production-electron.md` | 1–9 |
| 11 | `plans/11-advanced-calls-canvas-bots-workflows-admin.md` | 10 |

## 3. Global conventions (apply to all phases)

- Monorepo root `teamchat/` (we are currently in `D:\Documents\myproject2\electron\chat\` — scaffold inside it).
- Package manager: pnpm + `pnpm-workspace.yaml`. JavaScript everywhere (ES2022+), JSDoc for types. NO TypeScript, no `tsconfig`.
- Backend: Node.js + JavaScript + Express + PostgreSQL + Redis + Socket.IO (or native WS). REST + WS dual path.
- Auth: JWT access (short) + rotating refresh tokens, Argon2 hashing. Backend enforces all permissions.
- Electron: contextIsolation ON, sandbox, preload-only bridge (`window.teamchat.*`), IPC validation with zod/shared validation package.
- Shared: `packages/models` (JSDoc typedefs + shape constants) + `packages/validation` (zod schemas) are source of truth for DTOs/events.
- Testing per phase: Jest (unit) + Supertest (API) + Playwright (critical UI). Docker Compose for PG/Redis/MinIO.
- Definition of Done per phase: builds clean, tests pass, Docker up, acceptance checklist in plan file passes, docs updated.

## 4. How to work

1. Start at `plans/01-...`, finish all acceptance criteria before moving on.
2. Each plan file is self-contained: objective, prerequisites, tasks, contracts, UI, verification.
3. If a decision differs from document.md (e.g. Express route layout), update `plans/00-overview-architecture.md` first. NOTE: ReactJS/JavaScript decision already overrides document.md TypeScript/NestJS.

## 5. Current workspace status

- `document.md` — present, full vision spec.
- `plans/` — just created (this breakdown).
- No code yet: no `package.json`, no `apps/`, no `docker-compose.yml`. Phase 1 scaffolds all of it.
