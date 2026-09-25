$ErrorActionPreference = 'Stop'
Write-Host '== TeamChat bootstrap =='
docker compose up -d
pnpm install
node ./scripts/no-ts-guard.js
pnpm -r build
Write-Host 'Bootstrap done. Next: pnpm --filter @teamchat/server dev'
