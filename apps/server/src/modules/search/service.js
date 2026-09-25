import { query } from '../../database/db.js';

// SearchService abstraction (plan 08): PG FTS today, OpenSearch later
// without API change. All methods are workspace-scoped + permission-safe:
// private channels/files are invisible to non-members.

function visibleChannelClause(alias = 'c') {
  // Public channels + private-where-member (mirrors channels list route).
  return `(${alias}.is_private = false OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = ${alias}.id AND cm.user_id = $UID))`;
}

function decodeCursor(cursor) {
  const n = Number.parseInt(String(cursor || '0'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const SearchService = {
  // ---- messages ----
  async searchMessages({ workspaceId, userId, parsed, limit = 20, cursor = '0' }) {
    const offset = decodeCursor(cursor);
    const params = [workspaceId, userId];
    const where = ['m.workspace_id = $1', 'm.deleted_at IS NULL'];
    // Permission filter: channel must be visible.
    where.push(`EXISTS (SELECT 1 FROM channels c WHERE c.id = m.channel_id AND c.workspace_id = $1 AND ${visibleChannelClause('c').replaceAll('$UID', '$2')})`);

    if (parsed.fromUserId) {
      if (parsed.fromUserId === '__unknown__') return { items: [], nextCursor: null };
      params.push(parsed.fromUserId);
      where.push(`m.sender_id = $${params.length}`);
    }
    if (parsed.inChannelId) {
      if (parsed.inChannelId === '__unknown__') return { items: [], nextCursor: null };
      params.push(parsed.inChannelId);
      where.push(`m.channel_id = $${params.length}`);
    }
    if (parsed.hasFile) {
      where.push('EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id)');
    }
    if (parsed.before) {
      params.push(parsed.before.toISOString());
      where.push(`m.created_at < $${params.length}`);
    }
    if (parsed.after) {
      params.push(parsed.after.toISOString());
      where.push(`m.created_at > $${params.length}`);
    }

    const hasText = Boolean(parsed.text || parsed.phrases.length);
    let rankSelect = '0 AS rank';
    if (hasText) {
      // Combine free text + exact phrases into one tsquery input.
      const qtext = [parsed.text, ...parsed.phrases].filter(Boolean).join(' ');
      params.push(qtext);
      const qi = `$${params.length}`;
      where.push(`m.content_tsv @@ plainto_tsquery('english', ${qi})`);
      rankSelect = `ts_rank(m.content_tsv, plainto_tsquery('english', ${qi})) AS rank`;
    }
    // Exact-phrase containment (Slack "..." semantics) on top of stemming.
    for (const ph of parsed.phrases) {
      params.push(`%${ph}%`);
      where.push(`m.content ILIKE $${params.length}`);
    }
    if (parsed.text && !parsed.phrases.length) {
      // Partial-word fallback so "timeou" still matches "timeout" (Slack-like).
      // FTS handles stemming; trigram ILIKE covers substrings cheaply on seed data.
      params.push(`%${parsed.text}%`);
      // OR with FTS: keep FTS requirement but rank substring hits higher is
      // complex — instead accept either when free text is a single token.
      if (!parsed.text.includes(' ')) {
        where[where.length - 1] = `(${where[where.length - 1]} OR m.content ILIKE $${params.length})`;
      } else {
        params.pop();
      }
    }

    params.push(limit + 1);
    const lim = `$${params.length}`;
    params.push(offset);
    const off = `$${params.length}`;
    params.push([parsed.text, ...parsed.phrases].filter(Boolean).join(' ') || 'teamchat');
    const snip = `$${params.length}`;
    const orderBy = hasText ? 'rank DESC, m.created_at DESC' : 'm.created_at DESC';
    const r = await query(
      `SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
         c.name AS channel_name, c.is_private AS channel_private,
         ${rankSelect},
         ts_headline('english', m.content, plainto_tsquery('english', ${snip})) AS snippet,
         EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id) AS has_file
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN channels c ON c.id = m.channel_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy} LIMIT ${lim} OFFSET ${off}`,
      params
    );
    const hasMore = r.rows.length > limit;
    const page = hasMore ? r.rows.slice(0, limit) : r.rows;
    return {
      items: page.map((m) => ({
        id: m.id,
        workspaceId: m.workspace_id,
        channelId: m.channel_id,
        channelName: m.channel_name,
        sender: { id: m.sender_id, displayName: m.sender_name, avatarUrl: m.sender_avatar },
        content: m.content,
        snippet: m.snippet || m.content?.slice(0, 200) || '',
        createdAt: m.created_at,
        rank: Number(m.rank || 0),
        hasFile: Boolean(m.has_file),
      })),
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  },

  // ---- users (workspace members only) ----
  async searchUsers({ workspaceId, text, limit = 20, cursor = '0' }) {
    const offset = decodeCursor(cursor);
    const like = `%${text || ''}%`;
    const r = await query(
      `SELECT u.* FROM users u
        JOIN workspace_members wm ON wm.user_id = u.id
        WHERE wm.workspace_id = $1
          AND ($2 = '%%' OR u.display_name ILIKE $2 OR u.email ILIKE $2
               OR similarity(u.display_name, $3) > 0.2 OR similarity(u.email, $3) > 0.2)
        ORDER BY u.display_name LIMIT $4 OFFSET $5`,
      [workspaceId, like, text || '', limit + 1, offset]
    );
    const hasMore = r.rows.length > limit;
    const page = hasMore ? r.rows.slice(0, limit) : r.rows;
    return {
      items: page.map((u) => ({
        id: u.id, email: u.email, displayName: u.display_name,
        avatarUrl: u.avatar_url, status: u.status, customStatus: u.custom_status,
      })),
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  },

  // ---- channels (privacy-filtered) ----
  async searchChannels({ workspaceId, userId, text, limit = 20, cursor = '0' }) {
    const offset = decodeCursor(cursor);
    const like = `%${text || ''}%`;
    const r = await query(
      `SELECT c.*, (SELECT COUNT(*)::int FROM channel_members cm WHERE cm.channel_id = c.id) AS member_count
       FROM channels c
       WHERE c.workspace_id = $1
         AND (c.is_private = false OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2))
         AND ($3 = '%%' OR c.name ILIKE $3 OR c.description ILIKE $3 OR c.topic ILIKE $3
              OR similarity(c.name, $4) > 0.2)
       ORDER BY c.name LIMIT $5 OFFSET $6`,
      [workspaceId, userId, like, text || '', limit + 1, offset]
    );
    const hasMore = r.rows.length > limit;
    const page = hasMore ? r.rows.slice(0, limit) : r.rows;
    return {
      items: page.map((c) => ({
        id: c.id, workspaceId: c.workspace_id, name: c.name, slug: c.slug,
        description: c.description, topic: c.topic,
        isPrivate: c.is_private, isArchived: c.is_archived,
        memberCount: Number(c.member_count || 0),
      })),
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  },

  // ---- files (private-channel files invisible to non-members) ----
  async searchFiles({ workspaceId, userId, text, limit = 20, cursor = '0' }) {
    const offset = decodeCursor(cursor);
    const like = `%${text || ''}%`;
    const r = await query(
      `SELECT f.* FROM files f
       WHERE f.workspace_id = $1
         AND ($3 = '%%' OR f.filename ILIKE $3 OR similarity(f.filename, $4) > 0.15)
          AND (
            f.message_id IS NULL OR EXISTS (
              SELECT 1 FROM messages m JOIN channels c ON c.id = m.channel_id
              WHERE m.id = f.message_id
                AND (c.is_private = false OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2))
            )
          )
       ORDER BY f.created_at DESC LIMIT $5 OFFSET $6`,
      [workspaceId, userId, like, text || '', limit + 1, offset]
    );
    const hasMore = r.rows.length > limit;
    const page = hasMore ? r.rows.slice(0, limit) : r.rows;
    return {
      items: page.map((f) => ({
        id: f.id, workspaceId: f.workspace_id, uploaderId: f.uploader_id,
        messageId: f.message_id, filename: f.filename, mimeType: f.mime_type,
        size: Number(f.size), url: `/files/${f.id}`,
        thumbUrl: f.thumb_storage_key ? `/files/${f.id}/thumb` : null,
        createdAt: f.created_at,
      })),
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  },
};
