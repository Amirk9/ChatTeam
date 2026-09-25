import { Router } from 'express';
import { query, getOne } from '../../database/db.js';
import { requireAuth } from '../../common/auth.js';
import { requireWorkspace } from '../workspaces/permissions.js';
import {
  canvasCreateSchema, canvasPatchSchema, canvasBlocksSchema,
  canvasCommentSchema, validate,
} from '@teamchat/validation';
import { publish } from '../../websocket/index.js';

export const canvasRouter = Router();

function publicCanvas(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, channelId: row.channel_id,
    title: row.title, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function requireCanvas(req, res, next) {
  try {
    const cv = await getOne('SELECT * FROM canvas WHERE id = $1', [req.params.id]);
    if (!cv) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas not found' } });
    const mem = await getOne('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [cv.workspace_id, req.user.id]);
    if (!mem) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
    // Channel-linked canvases inherit private-channel visibility (Slack parity).
    if (cv.channel_id) {
      const ch = await getOne('SELECT is_private FROM channels WHERE id = $1', [cv.channel_id]);
      if (ch?.is_private) {
        const cm = await getOne('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [cv.channel_id, req.user.id]);
        if (!cm) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas not found' } });
      }
    }
    req.canvas = cv;
    next();
  } catch (e) {
    next(e);
  }
}

async function loadBlocks(canvasId) {
  const r = await query('SELECT * FROM canvas_blocks WHERE canvas_id = $1 ORDER BY position, id', [canvasId]);
  return r.rows.map((b) => ({
    id: b.id, kind: b.kind, content: b.content, data: b.data,
    position: Number(b.position), version: b.version,
    updatedBy: b.updated_by, updatedAt: b.updated_at,
  }));
}

// POST /workspaces/:wid/canvas — new doc (seeded with one paragraph).
canvasRouter.post('/workspaces/:wid/canvas', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const { title, channelId } = validate(canvasCreateSchema, req.body);
    if (channelId) {
      const ch = await getOne('SELECT id, workspace_id FROM channels WHERE id = $1', [channelId]);
      if (!ch || ch.workspace_id !== req.workspace.id) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } });
      }
    }
    const cv = await getOne(
      'INSERT INTO canvas(workspace_id, channel_id, title, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.workspace.id, channelId || null, title, req.user.id]
    );
    const first = await getOne(
      `INSERT INTO canvas_blocks(canvas_id, kind, content, position, updated_by) VALUES ($1,'paragraph','',0,$2) RETURNING *`,
      [cv.id, req.user.id]
    );
    await publish({ type: 'canvas.created', payload: { canvas: publicCanvas(cv) } }, [`workspace:${req.workspace.id}`]);
    res.status(201).json({ canvas: publicCanvas(cv), blocks: await loadBlocks(cv.id), _seed: first.id });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:wid/canvas — workspace docs.
canvasRouter.get('/workspaces/:wid/canvas', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM canvas WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 100', [req.workspace.id]);
    res.json({ canvas: r.rows.map(publicCanvas) });
  } catch (e) {
    next(e);
  }
});

// GET /canvas/:id — doc + blocks + comments.
canvasRouter.get('/canvas/:id', requireAuth, requireCanvas, async (req, res, next) => {
  try {
    const comments = await query(
      `SELECT cc.*, u.display_name AS author FROM canvas_comments cc JOIN users u ON u.id = cc.user_id
       WHERE cc.canvas_id = $1 ORDER BY cc.created_at`, [req.canvas.id]
    );
    res.json({ canvas: publicCanvas(req.canvas), blocks: await loadBlocks(req.canvas.id), comments: comments.rows });
  } catch (e) {
    next(e);
  }
});

// PATCH /canvas/:id — rename.
canvasRouter.patch('/canvas/:id', requireAuth, requireCanvas, async (req, res, next) => {
  try {
    const { title } = validate(canvasPatchSchema, req.body);
    const updated = await getOne('UPDATE canvas SET title = $2, updated_at = now() WHERE id = $1 RETURNING *', [req.canvas.id, title]);
    const out = publicCanvas(updated);
    await publish({ type: 'canvas.updated', payload: { canvas: out } }, [`canvas:${req.canvas.id}`]);
    res.json({ canvas: out });
  } catch (e) {
    next(e);
  }
});

// DELETE /canvas/:id
canvasRouter.delete('/canvas/:id', requireAuth, requireCanvas, async (req, res, next) => {
  try {
    await query('DELETE FROM canvas WHERE id = $1', [req.canvas.id]);
    await publish({ type: 'canvas.deleted', payload: { id: req.canvas.id } }, [`workspace:${req.canvas.workspace_id}`]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// PUT /canvas/:id/blocks — batch upsert with per-block LWW versioning:
// higher version wins, ties keep the stored row. All editors converge.
canvasRouter.put('/canvas/:id/blocks', requireAuth, requireCanvas, async (req, res, next) => {
  try {
    const { blocks } = validate(canvasBlocksSchema, req.body);
    const changed = [];
    for (const b of blocks) {
      if (b.delete && b.id) {
        await query('DELETE FROM canvas_blocks WHERE id = $1 AND canvas_id = $2', [b.id, req.canvas.id]);
        changed.push({ id: b.id, deleted: true });
        continue;
      }
      if (b.id) {
        const cur = await getOne('SELECT * FROM canvas_blocks WHERE id = $1 AND canvas_id = $2', [b.id, req.canvas.id]);
        if (!cur) continue;
        const incoming = b.version || 1;
        if (incoming < cur.version) continue; // loser of the race — stored wins
        const row = await getOne(
          `UPDATE canvas_blocks SET kind = COALESCE($3, kind), content = COALESCE($4, content),
            data = COALESCE($5, data), position = COALESCE($6, position),
            version = $7, updated_by = $8, updated_at = now()
           WHERE id = $1 AND canvas_id = $2 RETURNING *`,
          [b.id, req.canvas.id, b.kind, b.content, JSON.stringify(b.data ?? {}), b.position ?? cur.position, Math.max(incoming, cur.version + (incoming === cur.version ? 1 : 0)), req.user.id]
        );
        changed.push({ id: row.id, version: row.version });
      } else {
        const row = await getOne(
          `INSERT INTO canvas_blocks(canvas_id, kind, content, data, position, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [req.canvas.id, b.kind || 'paragraph', b.content || '', JSON.stringify(b.data ?? {}), b.position ?? Date.now(), req.user.id]
        );
        changed.push({ id: row.id, version: row.version });
      }
    }
    await query('UPDATE canvas SET updated_at = now() WHERE id = $1', [req.canvas.id]);
    const all = await loadBlocks(req.canvas.id);
    await publish({ type: 'canvas.blocks', payload: { canvasId: req.canvas.id, blocks: all, by: req.user.id } }, [`canvas:${req.canvas.id}`]);
    res.json({ blocks: all, changed });
  } catch (e) {
    next(e);
  }
});

// POST /canvas/:id/comments — discuss a doc or a block.
canvasRouter.post('/canvas/:id/comments', requireAuth, requireCanvas, async (req, res, next) => {
  try {
    const { content, blockId } = validate(canvasCommentSchema, req.body);
    if (blockId) {
      const blk = await getOne('SELECT id FROM canvas_blocks WHERE id = $1 AND canvas_id = $2', [blockId, req.canvas.id]);
      if (!blk) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Block not in this canvas' } });
    }
    const c = await getOne(
      'INSERT INTO canvas_comments(canvas_id, block_id, user_id, content) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.canvas.id, blockId || null, req.user.id, content]
    );
    await publish({ type: 'canvas.comment', payload: { canvasId: req.canvas.id, comment: c } }, [`canvas:${req.canvas.id}`]);
    res.status(201).json({ comment: c });
  } catch (e) {
    next(e);
  }
});
