# 10 — Production Electron (Packaging, Updates, Hardening)

Source: document.md §18 Phase 10. Stack: Electron + ReactJS (JavaScript, no TypeScript).

## Objective
Ship installable, auto-updating, observable desktop app for Win/macOS/Linux.

## Prerequisites
- Phases 01–09 functionally complete.

## Tasks
- [ ] `electron-builder`: NSIS (Win), DMG/pkg (macOS), AppImage/deb (Linux); icons, file associations (`teamchat://`), protocol handler
- [ ] Auto-update (`electron-updater` + release feed), staged rollouts, changelog UI
- [ ] Code signing (Win EV / Apple notarization), hardened runtime/entitlements, CSP audit, `npm audit`/SBOM, secret storage via safeStorage/keychain
- [ ] Crash reporting (crashpad → endpoint), structured logs (rotate, export), config (`%APPDATA%/TeamChat`), tray + badge counts + deep links, offline banner + queued sends
- [ ] Perf: bundle size, lazy routes, virtualized lists; Playwright packaged-app smoke; version endpoint `GET /version` compatibility check

## Acceptance
- [ ] Fresh install → login → chat → update → restart works on all three OSes; crashes/logs collectible; signed builds from CI
