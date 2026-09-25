# 05 — Messaging + Threads + Reactions + Mentions

Source: document.md §§2,7,18 Phase 5, §§22-23.

## Objective
Core chat: send/edit/delete/reply/threads/mentions/emoji/reactions/markdown/read-unread.

## Prerequisites
- Phase 04 (channels + membership).

## Tasks
### Backend `modules/messages|threads|reactions` (Express `.js`)
- [ ] Tables per §23: `messages(id, workspace_id, channel_id, sender_id, parent_message_id NULL (reply), content TEXT, message_type: text|system|bot, created_at, updated_at, deleted_at)`, `message_reactions(id, message_id, user_id, emoji, created_at, UNIQUE(message_id,user_id,emoji))`, `message_attachments(id, message_id, file_id, filename, mime_type, size, url)`, `message_mentions(message_id, mentioned_user_id)`, index `(channel_id, created_at)`, `threads` as view on `parent_message_id`
- [ ] Endpoints: `POST /channels/:id/messages` {content, parentMessageId?} (parse mentions), `GET /channels/:id/messages?cursor&limit` (keyset pagination), `GET /messages/:id/thread` (root+replies), `PATCH /messages/:id` (author only, edit window e.g. 24h, keep history `message_edits`), `DELETE /messages/:id` (soft delete; DELETE_MESSAGE perm allows mods), `POST/DELETE /messages/:id/reactions` {emoji}, `POST /channels/:id/read` {lastReadMessageId} + unread counts
- [ ] Markdown/rich-text: store raw markdown, sanitize render (no raw HTML), code blocks/links; link previews deferred

### Desktop `features/messages|threads + stores/message.store.js` (ReactJS `.jsx`)
- [ ] Feed (virtualized, date separators, edited/deleted states), composer (markdown, @mention autocomplete, emoji picker, code block), thread pane (root + replies + reply box), reaction bar, read/unread dividers, timestamps (local TZ)

### Tests
- [ ] Pagination determinism; edit-permission; soft-delete hides content but keeps thread; reaction toggle idempotent; mention extraction

## Acceptance
- [ ] Two users can converse with threads/reactions/mentions/edits; history paginates; unread markers correct
