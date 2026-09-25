$ErrorActionPreference = 'Stop'
docker compose up -d
pnpm --filter @teamchat/server dev
