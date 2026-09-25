# 08 — Search (Messages/Users/Channels/Files)

Source: document.md §6, §18 Phase 8.

## Objective
Fast search with `from: in: "phrase" has:file before: after:` over PG FTS (OpenSearch later).

## Prerequisites
- Phases 03–07 (data exists).

## Tasks
### Backend `modules/search` (Express `.js`)
- [ ] PG: `messages.content_tsv TSVECTOR` + trigger, GIN indexes; `channels(name,description)`, `users(display_name,email)`, `files(filename)` trigrams (`pg_trgm`)
- [ ] `GET /search?q=&workspaceId&type=messages|users|channels|files&limit&cursor` — parser for `from:@user in:#channel "exact" has:file before:2026-09-01 after:2026-08-01`; permission-filter (exclude private channels/files user can't see); highlight snippets; `ts_rank` ordering
- [ ] Abstraction `SearchService` so OpenSearch can replace PG later without API change

### Desktop `features/search + pages/Search` (ReactJS `.jsx`)
- [ ] Top-bar `🔍` (per §27) with type filters, recent searches, keyboard shortcut (Ctrl+K), result jump-to-message, user/channel quick-switch

### Tests
- [ ] Parser unit tests; invisibility of private content; ranking sanity; `has:file`/`from:`/`in:` correctness

## Acceptance
- [ ] Queries like `from:amir in:#dev "timeout" has:file` return correct, permission-safe results <300ms on seed data
