import { getOne, query } from '../../database/db.js';

// Slack-style query parser (plan 08, document.md §6).
// Supported: from:@user|email|name  in:#channel|name  "exact phrase"
//   has:file  before:YYYY-MM-DD  after:YYYY-MM-DD  + free text.
//
// Pure function — unit-testable without DB. resolveSearchRefs() maps
// display names to IDs workspace-side.
export function parseSearchQuery(raw) {
  const out = { text: '', phrases: [], from: null, inChannel: null, hasFile: false, before: null, after: null };
  if (!raw || typeof raw !== 'string') return out;
  let s = raw;

  // Quoted exact phrases first (keep them out of token splitting).
  const phrases = [];
  s = s.replace(/"([^"]{1,200})"/g, (_m, p) => {
    phrases.push(p.trim());
    return ' ';
  });
  out.phrases = phrases.filter(Boolean);

  const tokens = s.split(/\s+/).filter(Boolean);
  const textTokens = [];
  for (const tok of tokens) {
    const low = tok.toLowerCase();
    if (low.startsWith('from:') && tok.length > 5) {
      out.from = tok.slice(5).replace(/^@/, '');
    } else if (low.startsWith('in:') && tok.length > 3) {
      out.inChannel = tok.slice(3).replace(/^#/, '');
    } else if (low === 'has:file' || low === 'has:files') {
      out.hasFile = true;
    } else if (low.startsWith('before:')) {
      const d = new Date(tok.slice(7));
      if (!Number.isNaN(d.getTime())) out.before = d;
    } else if (low.startsWith('after:')) {
      const d = new Date(tok.slice(6));
      if (!Number.isNaN(d.getTime())) out.after = d;
    } else {
      textTokens.push(tok);
    }
  }
  out.text = textTokens.join(' ').trim();
  return out;
}

// Resolve from:/in: display values to concrete IDs within a workspace.
// from matches email exact/prefix OR display_name ILIKE; in matches
// channel name/slug (case-insensitive, leading # optional).
export async function resolveSearchRefs(workspaceId, parsed) {
  const resolved = { ...parsed, fromUserId: null, inChannelId: null };
  if (parsed.from) {
    const key = parsed.from.toLowerCase();
    const r = await query(
      `SELECT u.id FROM users u
        JOIN workspace_members wm ON wm.user_id = u.id
        WHERE wm.workspace_id = $1
          AND (lower(u.email) = $2 OR lower(u.email) LIKE $2 || '%' OR lower(u.display_name) = $2 OR lower(u.display_name) LIKE $2 || '%')
        ORDER BY CASE WHEN lower(u.email) = $2 THEN 0 ELSE 1 END
        LIMIT 1`,
      [workspaceId, key]
    );
    // Fallback: lookup by user id prefix is not allowed — unknown user
    // means the filter matches nothing (Slack shows empty, not everything).
    resolved.fromUserId = r.rows[0]?.id || '__unknown__';
  }
  if (parsed.inChannel) {
    const key = parsed.inChannel.toLowerCase();
    const ch = await getOne(
      `SELECT id FROM channels WHERE workspace_id = $1 AND (lower(name) = $2 OR lower(slug) = $2) LIMIT 1`,
      [workspaceId, key]
    );
    resolved.inChannelId = ch?.id || '__unknown__';
  }
  return resolved;
}
