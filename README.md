# TeamChat — Slack-like desktop collaboration (ReactJS + JavaScript)

> Phase 1 foundation. Stack: Electron + ReactJS (JS/JSX) + Vite, Node.js + Express (JS), PostgreSQL + Redis + MinIO. **No TypeScript.**

## Quick start — everything in Docker

```powershell
# 1. build + start the whole stack (postgres, redis, backend API, frontend)
docker compose up -d --build

# 2. check it
docker ps                                   # 4 containers running
Invoke-RestMethod http://localhost:3000/health   # status: ok
```

Open the app: http://localhost:5173 (React UI) — API at http://localhost:3000.

Stop: `docker compose down`.

## Quick start — local Node (alternative)

```powershell
# 1. infra
docker compose up -d

# 2. install + guard + build
powershell -File ./scripts/bootstrap.ps1

# 3. run backend
pnpm --filter @teamchat/server dev
# GET http://localhost:3000/health

# 4. run desktop renderer (web dev mode until Electron wired in 1.3)
pnpm --filter @teamchat/desktop dev
```

See `plans/` for the phased implementation plan. Source vision: `document.md`.
