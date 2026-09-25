# 00 — Overview & Architecture (read first)

## Objective
Lock decisions from document.md §§1,17-19,23-29 so all later phases build consistently.

## Locked stack — ReactJS + JavaScript (NO TypeScript)
- Desktop: Electron + ReactJS (JavaScript, JSX) + Vite
- Backend: Node.js + JavaScript + **Express** (plain JS, feature-folder structure — NestJS dropped because it is TypeScript-first)
- DB: PostgreSQL 16 (durable data + FTS), Redis 7 (presence/typing/pub-sub/sessions), MinIO (S3-compatible files, local dev)
- Realtime: Socket.IO (rooms per workspace/channel/user) — or native `ws` if you want to hand-roll; pick one now
- Auth: JWT access + rotating refresh + Argon2id + (later OAuth2/OIDC)
- Tooling: pnpm monorepo, Docker Compose, GitHub Actions, Jest + Supertest + Playwright; ESLint (JS) + Prettier; `jsconfig.json`, NO `tsconfig`

## Target topology (from document.md §17/29)
```
Electron (ReactJS/JS) ─┐
                      ├─ HTTPS/WS ─ REST API + Realtime Server ─ Services (Auth/User/Workspace/Channel/Message/File/Search/Notif/Integration)
Web (ReactJS/JS) ───────┘                                                              │── PostgreSQL / Redis / MinIO
Later: LB → API xN → Redis pub/sub → PG + MinIO
```

## Monorepo layout to enforce (document.md §19)
```
teamchat/
  apps/desktop/{electron/{main,preload,ipc},renderer/{app,components,features,pages,stores,services,styles}}   # *.js / *.jsx only
  apps/server/src/{modules/*,common,config,database,websocket}   # *.js only (Express routers/services)
  apps/web/ (stub until Phase 10)
  packages/{shared,models,validation,api-client,ui,config}   # models = JSDoc typedefs, NO TypeScript types package
  infrastructure/{docker,postgres,redis,minio}
  docs/{architecture,api,database,security}
  scripts/ tests/ docker-compose.yml pnpm-workspace.yaml
```

## Key contracts (must not drift)
- Message model: `messages(id, workspace_id, channel_id, sender_id, parent_message_id, content, message_type, created_at, updated_at, deleted_at)` + `message_reactions / message_attachments / message_mentions`
- REST: `POST /messages, GET /channels, GET /users, POST /channels` pattern; full per-phase specs later
- WS events: `message.created|updated|deleted, user.typing, user.presence_changed, channel.created|updated, reaction.added|removed`
- Electron security: `React → Preload(contextBridge) → IPC → Main → OS`. No `nodeIntegration`, no raw Electron in renderer
- Permissions (backend-enforced): Owner/Admin/Moderator/Member/Guest/Bot; `CREATE_CHANNEL, DELETE_CHANNEL, INVITE_MEMBER, REMOVE_MEMBER, MANAGE_WORKSPACE, MANAGE_INTEGRATIONS, DELETE_MESSAGE, MANAGE_ROLES, VIEW_AUDIT_LOG`
- UI target: 3-pane (nav / feed+composer / info) + top bar (search/bell/profile) — document.md §27

## Decisions to record here before Phase 1
- [x] Language: JavaScript only (ReactJS JSX frontend, plain JS backend) — TypeScript/NestJS rejected per project decision
- [ ] Express vs Fastify-JS (default: Express)
- [ ] Socket.IO vs native WS (default: Socket.IO)
- [ ] pnpm version, Node LTS (e.g. Node 20), PG/Redis/MinIO versions
- [ ] Repo root: scaffold directly in this folder or subfolder `teamchat/`?
- [ ] Web app: stub now or defer to Phase 10?

## Exit criteria
- [ ] This file updated with the above decisions
- [ ] Proceed to `01-foundation-monorepo.md`
