# 01 — Foundation: Monorepo + Tooling + Docker

Source: document.md §18 Phase 1, §19.

## Objective
Empty workspace → runnable monorepo skeleton with Electron+ReactJS (JS)+Vite, Express (JS), PG+Redis+MinIO in Docker, shared models/validation, CI, tests. No product features yet. NO TypeScript anywhere.

## Prerequisites
- `00-overview-architecture.md` decisions locked. Node LTS, pnpm, Docker Desktop installed.

## Tasks
### 1.1 Root
- [ ] `package.json` (workspaces), `pnpm-workspace.yaml`, `jsconfig.json` (NO tsconfig), `.gitignore`, `.editorconfig`, `.nvmrc`, `README.md`
- [ ] `packages/models` (JSDoc typedefs + shape constants: User, Workspace, Channel, Message, WS events), `packages/validation` (zod schemas in JS), `packages/api-client` (fetch wrapper in JS), `packages/config` (eslint JS + prettier presets), `packages/shared` (constants), `packages/ui` (ReactJS button/input/avatar placeholders as `.jsx`)
- [ ] `docker-compose.yml` (postgres:16, redis:7, minio + createbucket), `infrastructure/{postgres/init.sql,redis/redis.conf,minio/}` , `.env.example`
- [ ] `scripts/dev.sh|ps1`, `scripts/bootstrap.sh|ps1`
- [ ] `docs/architecture/overview.md`, `docs/database/schema-v0.md`, `docs/api/conventions.md`, `docs/security/electron.md`

### 1.2 Backend stub `apps/server` (Express + JavaScript)
- [ ] Express app with `GET /health` → `{status:"ok", version, deps:{postgres,redis}}`
- [ ] Config (env validation via zod/envalid in JS), DB client (`pg` + `node-pg-migrate` or Knex-JS — pick ONE, record in 00), migration system, seed script (1 admin user)
- [ ] Logging (pino), error envelope `{error:{code,message,details}}`, request-id, CORS for `http://localhost:5173`
- [ ] Tests: Jest/Supertest health + DB connectivity

### 1.3 Desktop stub `apps/desktop` (Electron + ReactJS)
- [ ] Vite+ReactJS renderer in JS/JSX (App shell: sidebar/feed/info placeholders per §27 mock), Electron `main/` (`main.js, window-manager.js, app-lifecycle.js, tray.js, notifications.js, updater.js stub, protocol-handler.js stub`), `preload/` (`preload.js, api.js, types.js` with JSDoc, exposing `window.teamchat` only), `ipc/` (`auth.ipc.js, file.ipc.js, window.ipc.js, notification.ipc.js, system.ipc.js` with ping/version handlers)
- [ ] Security: `contextIsolation:true, sandbox:true, nodeIntegration:false`, CSP header, IPC input validation
- [ ] `electron-vite` or `electron-builder` config; `npm run dev` launches Electron+renderer+HMR

### 1.4 Web stub `apps/web`
- [ ] Minimal Vite ReactJS (JS) `GET /health` display (full web client deferred to Phase 10)

### 1.5 CI/QA
- [ ] GitHub Actions: lint+test+build (NO typecheck — no TypeScript); Playwright smoke (app launches, health page)
- [ ] Prettier/ESLint (JS) pass, `pnpm -r build` green

## Verification
```powershell
docker compose up -d; pnpm install; pnpm -r build
pnpm --filter server start:dev   # GET localhost:3000/health -> ok
pnpm --filter desktop dev        # Electron window opens, no console errors
pnpm test
```

## Acceptance
- [ ] One command brings up infra; health checks pass; Electron opens with secure preload; CI green
- [ ] No CMake confusion (JS ecosystem only — per document.md note). No TypeScript files (enforce: fail CI if any `*.ts`/`*.tsx` added)
- [ ] Ready for Phase 02 Auth
