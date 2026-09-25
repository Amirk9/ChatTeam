# 03 — Workspace + Users + Roles & Permissions

Source: document.md §2 (Workspace/Users blocks), §16, §18 Phase 3, §§21-22.

## Objective
Multi-workspace tenancy with members, roles, invites, switching, profiles/presence basics.

## Prerequisites
- Phase 02 (auth/me).

## Tasks
### Backend `modules/workspaces|members|users (+ RBAC)` — Express routers/services in `.js`
- [ ] Tables: `workspaces(id, name, slug unique, icon_url, settings jsonb, created_by, created_at)`, `workspace_members(workspace_id, user_id, role, joined_at, invited_by, PK(workspace_id,user_id))`, `roles(name PK: owner|admin|moderator|member|guest|bot)`, `permissions(name PK)`, `role_permissions(role,permission)`, `invites(id, workspace_id, email, role, token, expires_at, accepted_at)`
- [ ] Permission matrix from §16 enforced via `requirePermission(...)` middleware + workspace-membership middleware on every route
- [ ] Endpoints: `POST /workspaces` (creator=owner), `GET /workspaces` (mine), `GET/PATCH/DELETE /workspaces/:id` (MANAGE_WORKSPACE), `POST /workspaces/:id/invites`, `POST /workspaces/join` {token|slug}, `GET /workspaces/:id/members`, `PATCH /workspaces/:id/members/:userId` (role), `DELETE .../members/:userId`, `POST /workspaces/:id/switch` (scope token/session)
- [ ] Users: `GET /users/:id` (workspace-scoped), presence fields `status, custom_status, timezone, last_seen_at`

### Desktop `features/workspace + stores/workspace.store.js` (ReactJS `.jsx`)
- [ ] Workspace switcher, create/join dialogs, settings page, members list with role actions (permission-gated UI), profile page (avatar upload stub → Phase 07, display name/status/timezone)

### Tests
- [ ] RBAC matrix test: guest cannot CREATE_CHANNEL/INVITE; member cannot MANAGE_WORKSPACE; backend rejects even if UI bypassed
- [ ] Invite→join→switch flow; slug uniqueness

## Acceptance
- [ ] Create → invite → join → switch works; roles gate every action server-side; members list correct
