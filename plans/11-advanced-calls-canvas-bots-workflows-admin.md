# 11 — Advanced: Calls, Canvas, Bots, Integrations, Workflows, Admin

Source: document.md §§10-15, §18 Phase 11. DO NOT start until Phases 01–10 are done. Stack: ReactJS + JavaScript only (no TypeScript).

## Objective
Parity push toward full Slack: Huddles-like calls, Canvas docs, bots/slash, integrations, workflows, admin/audit.

## Workstreams (each its own sub-plan when started)
### A. Voice/Video (Huddles)
- [ ] WebRTC P2P (voice/video/screen, mute/cam, roster) → STUN/TURN → SFU (LiveKit/mediasoup) for groups; tables `calls, call_participants`; `features/calls`

### B. Canvas
- [ ] `canvas, canvas_blocks, canvas_comments`; Tiptap/ProseMirror/Lexical + Yjs CRDT over WS; checklists/tables/images/comments; `features/canvas`

### C. Bots + Slash commands
- [ ] `bots, bot_commands`; bot users + tokens; `/meeting`, `/github` parsing; interactive buttons/modals; `POST /bots/:id/messages`

### D. Integrations & Webhooks
- [ ] `integrations, webhooks`; incoming webhook → channel post (GitHub PR merged example); outgoing event subscriptions; OAuth per provider; signature verification

### E. Workflows
- [ ] `workflows, workflow_steps`; Trigger→Condition→Action→Result builder; onboarding template (create channel → welcome → checklist → notify HR)

### F. Admin & Compliance
- [ ] Dashboard: users/teams/channels/roles/audit/sessions/devices/integrations/storage/usage/billing/policies; `audit_logs` on all privileged actions; retention/exports; `VIEW_AUDIT_LOG` gating

## Acceptance (per workstream)
- [ ] Demo scenario passes (e.g. GitHub webhook posts to #development; `/meeting create` works; 3-person call with screen share; co-edited canvas converges; onboarding workflow runs; audit log shows all admin actions)
