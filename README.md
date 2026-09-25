# TeamChat — Slack-like desktop collaboration (ReactJS + JavaScript)

> Phase 1 foundation. Stack: Electron + ReactJS (JS/JSX) + Vite, Node.js + Express (JS), PostgreSQL + Redis + MinIO. **No TypeScript.**

## Quick start

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
