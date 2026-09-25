# 07 — File Sharing & Attachments

Source: document.md §5, §18 Phase 7.

## Objective
Upload/download/preview/share files attached to messages (MinIO local, S3-swappable).

## Prerequisites
- Phases 05–06 (messages + realtime).

## Tasks
### Backend `modules/files` + storage abstraction (plain JS)
- [ ] Table: `files(id, workspace_id, uploader_id, message_id NULL, filename, mime_type, size, storage_key, bucket, checksum, width/height/duration NULL, created_at)`; limits (e.g. 50MB default, allowlist mime, virus-scan hook stub)
- [ ] `StorageService` interface (`put/get/delete/signedUrl`) with `MinioAdapter`; presigned PUT for direct upload + `POST /files/confirm`, or proxied `POST /files (multipart)` for MVP; `GET /files/:id` (perm-checked redirect/signed URL), `DELETE /files/:id`, `POST /files/:id/share` {channelId|messageId}
- [ ] Link `message_attachments` on send; WS `message.created` includes attachment metadata; image thumbnails (sharp) async job

### Desktop `features/files + ipc/file.ipc.js` (ReactJS)
- [ ] Attach via native dialog (`window.teamchat.files.open/save`), drag-drop, progress bars, inline previews (image/PDF/video/audio), download/save-as, share-to-channel

### Tests
- [ ] Upload→attach→render→download round-trip; private-channel file inaccessible to non-members; size/mime rejection

## Acceptance
- [ ] Files flow end-to-end with previews; permissions + quotas enforced; swapping MinIO→S3 is config-only
