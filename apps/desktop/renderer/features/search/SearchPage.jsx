import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useChannels } from '../../stores/channel.store.jsx';
import { useMessages } from '../../stores/message.store.jsx';
import { searchApi } from '../../services/search.js';

const TABS = ['all', 'messages', 'users', 'channels', 'files'];

function Snippet({ html }) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function requestJump(channelId, messageId) {
  sessionStorage.setItem('tc_jump', JSON.stringify({ channelId, messageId }));
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') || '';
  const nav = useNavigate();
  const { current: workspace } = useWorkspace();
  const { channels, select } = useChannels();
  const { load } = useMessages();
  const [q, setQ] = useState(initialQ);
  const [tab, setTab] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (query, type) => {
    if (!workspace || !query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await searchApi.search({ workspaceId: workspace.id, q: query.trim(), type });
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => { setQ(initialQ); }, [initialQ]);
  useEffect(() => {
    if (workspace && initialQ.trim()) run(initialQ, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, initialQ, tab]);

  async function jumpTo(msg) {
    await select(workspace.id, msg.channelId);
    try { await load(msg.channelId); } catch {}
    requestJump(msg.channelId, msg.id);
    nav('/');
    setTimeout(() => {
      document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 400);
  }

  const channelName = (id) => channels.find((c) => c.id === id)?.name || null;

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto text-[#1d1c1d] dark:text-white">
      <form onSubmit={(e) => { e.preventDefault(); setParams({ q: q.trim() }); run(q, tab); }} className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Try: from:amir in:#dev "timeout" has:file'
          className="flex-1 border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#611f69]"
        />
        <button className="text-sm px-4 py-2 rounded bg-[#611f69] text-white">Search</button>
      </form>
      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs px-3 py-1 rounded-full border capitalize ${tab === t ? 'bg-[#611f69] text-white border-[#611f69]' : 'border-gray-300 dark:border-white/15 hover:bg-gray-100 dark:hover:bg-white/10'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {loading ? <p className="text-sm text-gray-500 dark:text-white/40">Searching...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && data ? <Results data={data} tab={tab} onJump={jumpTo} channelName={channelName} /> : null}
      {!loading && !data && !error ? (
        <p className="text-sm text-gray-500 dark:text-white/40">Slack-style search: <code>from:@user</code> · <code>in:#channel</code> · <code>"exact phrase"</code> · <code>has:file</code> · <code>before:</code>/<code>after:</code></p>
      ) : null}
    </div>
  );
}

function Results({ data, tab, onJump, channelName }) {
  const show = (t) => tab === 'all' || tab === t;
  const msgs = tab === 'all' ? data.messages?.items || [] : data.items || [];
  return (
    <div className="space-y-6">
      {show('messages') && (
        <section>
          <h3 className="font-bold text-sm mb-2">Messages ({tab === 'all' ? data.messages?.items?.length || 0 : data.items?.length || 0})</h3>
          {msgs.length === 0 ? <p className="text-sm text-gray-400">No messages found.</p> : msgs.map((m) => (
            <button key={m.id} onClick={() => onJump(m)} className="w-full text-left border border-gray-200 dark:border-white/10 rounded-lg p-3 mb-2 hover:border-[#611f69] dark:bg-white/5">
              <p className="text-xs text-gray-500 dark:text-white/40 mb-1">
                <span className="font-semibold text-black dark:text-white">{m.sender.displayName}</span> in #{m.channelName || channelName(m.channelId) || 'channel'} · {new Date(m.createdAt).toLocaleString()}
                {m.hasFile ? ' · 📎' : ''}
              </p>
              <p className="text-sm"><Snippet html={m.snippet} /></p>
            </button>
          ))}
        </section>
      )}
      {show('users') && (
        <section>
          <h3 className="font-bold text-sm mb-2">People</h3>
          {((tab === 'all' ? data.users?.items : data.items) || []).map((u) => (
            <div key={u.id} className="flex items-center gap-2 border border-gray-200 dark:border-white/10 rounded-lg p-2 mb-1 text-sm dark:bg-white/5">
              <div className="w-7 h-7 rounded bg-[#4A154B] text-white flex items-center justify-center font-bold">{(u.displayName || '?').slice(0, 1).toUpperCase()}</div>
              <span className="font-semibold">{u.displayName}</span>
              <span className="text-gray-400 text-xs">{u.email} · {u.status}</span>
            </div>
          ))}
        </section>
      )}
      {show('channels') && (
        <section>
          <h3 className="font-bold text-sm mb-2">Channels</h3>
          {((tab === 'all' ? data.channels?.items : data.items) || []).map((c) => (
            <Link key={c.id} to="/" className="block border border-gray-200 dark:border-white/10 rounded-lg p-2 mb-1 text-sm hover:border-[#611f69] dark:bg-white/5">
              <span className="font-semibold"># {c.name}</span> {c.isPrivate ? '🔒' : ''}
              <span className="text-gray-400 text-xs ml-2">{c.description}</span>
            </Link>
          ))}
        </section>
      )}
      {show('files') && (
        <section>
          <h3 className="font-bold text-sm mb-2">Files</h3>
          {((tab === 'all' ? data.files?.items : data.items) || []).map((f) => (
            <a key={f.id} href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/files/${f.id}?download=1`} className="block border border-gray-200 dark:border-white/10 rounded-lg p-2 mb-1 text-sm hover:border-[#611f69] dark:bg-white/5">
              <span className="font-semibold">📎 {f.filename}</span>
              <span className="text-gray-400 text-xs ml-2">{f.mimeType} · {(Number(f.size) / 1024).toFixed(1)} KB</span>
            </a>
          ))}
        </section>
      )}
    </div>
  );
}
