# 02 — Authentication & Sessions

Source: document.md §2 (Auth block), §18 Phase 2, §21 auth module, §22 sessions/refresh_tokens.

## Objective
Register/login/logout/refresh/forgot/reset/email-verify with JWT + Argon2 + sessions, wired into Electron login UI.

## Prerequisites
- Phase 01 done (Express-JS + PG + Redis + shared validation). JavaScript only, no TypeScript.

## Tasks
### Backend `apps/server/src/modules/auth` + `users` (Express routers + services in `.js`)
- [ ] Tables: `users(id, email CITEXT unique, password_hash, display_name, avatar_url, timezone, status, email_verified_at, created_at, updated_at)`, `sessions(id, user_id, device_info, ip, created_at, expires_at, revoked_at)`, `refresh_tokens(id, user_id, session_id, token_hash, expires_at, rotated_to, revoked_at)`, `email_verification_tokens`, `password_reset_tokens`
- [ ] Endpoints:
  - `POST /auth/register` {email,password,displayName} → 201 + verification email (log in dev)
  - `POST /auth/login` → {accessToken (15m), refreshToken (httpOnly cookie + body for Electron), user}
  - `POST /auth/refresh` (rotation, reuse detection → revoke chain)
  - `POST /auth/logout` (revoke session+tokens)
  - `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/verify-email?token`, `GET /auth/me` (guard)
- [ ] Middleware: `requireAuth` (JWT verify), `getCurrentUser(req)`, rate-limit login (Redis), Argon2id, zod validation, audit log on login/logout
- [ ] `GET /users/me`, `PATCH /users/me` (display name/avatar/timezone/status)

### Desktop `renderer/features/auth + stores/auth.store.js + services/api` (ReactJS)
- [ ] Pages (`.jsx`): Login / Register / Forgot / Reset / Verify; token storage via Electron `safeStorage` (never localStorage for refresh), auth IPC (`auth.ipc.js`: login/logout/getSession)
- [ ] Providers: auth context, protected routes, auto-refresh on 401, logout on reuse-revocation

### Tests
- [ ] Supertest: register→verify→login→me→refresh→logout→refresh-fails; reuse-attack revokes chain; validation errors
- [ ] Playwright: register + login happy path

## Acceptance
- [ ] Full auth cycle works in Electron; refresh rotation + reuse detection verified; sessions listed/revoked; argon2 hashes only in DB
