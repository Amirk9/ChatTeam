import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useChannels } from '../../stores/channel.store.jsx';
import { usePresence } from '../../stores/presence.store.jsx';
import { channelApi } from '../../services/channels.js';
import { canvasApi } from '../../services/canvas.js';
import { workspaceApi } from '../../services/workspaces.js';
import HuddleButton from '../calls/HuddleButton.jsx';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';

function favKey(id) {
  return `tc_star_${id}`;
}
function muteKey(id) {
  return `tc_mute_${id}`;
}

// Real-Slack channel header: ☆ #name, tabs (Messages/Add canvas/+),
// Invite teammates, Huddle, bell, search, info. Dark-first styling.
export function ChannelHeader({ onMembers, tab, setTab }) {
  const { current: workspace } = useWorkspace();
  const { current, refresh } = useChannels();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [starred, setStarred] = useState(false);
  const [muted, setMuted] = useState(false);
  const [menu, setMenu] = useState(false);
  const [invite, setInvite] = useState(false);
  const [canvases, setCanvases] = useState([]);

  // Welcome-card "Invite teammates" opens this same dialog.
  useEffect(() => {
    const fn = () => setInvite(true);
    window.addEventListener('teamchat:channel-invite', fn);
    return () => window.removeEventListener('teamchat:channel-invite', fn);
  }, []);

  useEffect(() => {
    setDescription(current?.description || '');
    setTopic(current?.topic || '');
    try {
      setStarred(localStorage.getItem(favKey(current?.id)) === '1');
      setMuted(localStorage.getItem(muteKey(current?.id)) === '1');
    } catch {
      setStarred(false);
      setMuted(false);
    }
  }, [current?.id]);

  useEffect(() => {
    if (workspace?.id) {
      canvasApi.list(workspace.id).then((all) => setCanvases(all.filter((c) => c.channelId === current?.id))).catch(() => setCanvases([]));
    }
  }, [workspace?.id, current?.id]);

  if (!current) return null;
  const canManage = workspace && ['owner', 'admin'].includes(workspace.role);

  function toggleStar() {
    const next = !starred;
    setStarred(next);
    try {
      if (next) localStorage.setItem(favKey(current.id), '1');
      else localStorage.removeItem(favKey(current.id));
    } catch {}
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      if (next) localStorage.setItem(muteKey(current.id), '1');
      else localStorage.removeItem(muteKey(current.id));
    } catch {}
  }

  async function addCanvas() {
    try {
      const cv = await canvasApi.create(workspace.id, { title: `#${current.name} canvas`, channelId: current.id });
      setCanvases((c) => [...c, cv]);
      setTab?.(`canvas:${cv.id}`);
      nav(`/canvas/${cv.id}`);
    } catch {}
  }

  async function save(e) {
    e.preventDefault();
    await channelApi.patch(current.id, { description, topic });
    await refresh(workspace.id);
    setEditing(false);
  }

  async function archive() {
    if (!window.confirm(`Archive #${current.name}?`)) return;
    await channelApi.archive(current.id);
    await refresh(workspace.id);
    setMenu(false);
  }

  async function unarchive() {
    await channelApi.unarchive(current.id);
    await refresh(workspace.id);
    setMenu(false);
  }

  async function leave() {
    if (!window.confirm(`Leave #${current.name}?`)) return;
    await channelApi.leave(current.id);
    await refresh(workspace.id);
    setMenu(false);
  }

  async function destroy() {
    if (!window.confirm(`Delete #${current.name} forever?`)) return;
    await channelApi.remove(current.id);
    await refresh(workspace.id);
    setMenu(false);
  }

  return (
    <div className="shrink-0 border-b border-gray-200 dark:border-white/10">
      <div className="px-4 pt-2 pb-0 flex items-center gap-1">
        <button onClick={toggleStar} title={starred ? 'Unstar' : 'Star'} className={`text-lg px-1 ${starred ? 'text-yellow-400' : 'text-gray-400 dark:text-white/40 hover:text-yellow-400'}`}>
          {starred ? '★' : '☆'}
        </button>
        <h2 className="font-bold text-lg text-[#1d1c1d] dark:text-white truncate">
          {current.isPrivate ? '🔒 ' : '# '}{current.name}
        </h2>
        {current.isArchived ? <span className="text-xs bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-full font-semibold">archived</span> : null}
        <div className="flex-1" />
        <button onClick={() => setInvite(true)} className="hidden sm:flex items-center gap-1 text-[13px] px-2 py-1 rounded-md text-[#1d1c1d] dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10">
          <span>👤+</span> Invite teammates
        </button>
        <HuddleButton workspaceId={workspace?.id} target={{ channelId: current.id }} />
        <button onClick={toggleMute} title={muted ? 'Unmute channel' : 'Mute channel'}
          className="p-1.5 rounded-md text-gray-500 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10">
          {muted ? '🔕' : '🔔'}
        </button>
        <button onClick={() => document.querySelector('[data-slack-search] input')?.focus()} title="Search"
          className="p-1.5 rounded-md text-gray-500 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10">🔍</button>
        <button onClick={onMembers} title="Channel info"
          className="p-1.5 rounded-md text-gray-500 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10">ⓘ</button>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} title="More actions" className="p-1.5 rounded-md text-gray-500 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10">⋮</button>
          {menu ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-[#1A1D21] dark:border-white/10 text-[#1d1c1d] dark:text-white rounded-lg shadow-xl border border-gray-200 py-1 z-40 text-sm">
                <button onClick={onMembers} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10">Channel info</button>
                {canManage && !current.isArchived ? <button onClick={archive} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10">Archive channel</button> : null}
                {canManage && current.isArchived ? <button onClick={unarchive} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10">Unarchive</button> : null}
                {current.slug !== 'general' ? <button onClick={leave} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10">Leave channel</button> : null}
                {canManage && current.slug !== 'general' ? <button onClick={destroy} className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Delete channel</button> : null}
                {canManage ? <button onClick={() => { setEditing((v) => !v); setMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10">Edit topic</button> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {/* Tabs: Messages | canvases | Add canvas | + */}
      <div className="px-4 flex items-center gap-1 text-sm">
        <button onClick={() => setTab?.('messages')}
          className={`px-2 py-1.5 border-b-2 ${tab === 'messages' || !tab ? 'border-[#611f69] dark:border-white font-bold text-[#1d1c1d] dark:text-white' : 'border-transparent text-gray-500 dark:text-white/50 hover:text-[#1d1c1d] dark:hover:text-white'}`}>
          💬 Messages
        </button>
        {canvases.map((c) => (
          <button key={c.id} onClick={() => nav(`/canvas/${c.id}`)} title={c.title}
            className="px-2 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-white/50 hover:text-[#1d1c1d] dark:hover:text-white max-w-40 truncate">
            📄 {c.title}
          </button>
        ))}
        <button onClick={addCanvas} className="px-2 py-1.5 border-b-2 border-transparent text-gray-500 dark:text-white/50 hover:text-[#1d1c1d] dark:hover:text-white">
          📝 Add canvas
        </button>
        <button onClick={addCanvas} title="New canvas" className="px-1 py-1.5 text-gray-400 dark:text-white/40 hover:text-[#1d1c1d] dark:hover:text-white">+</button>
      </div>
      {editing ? (
        <form onSubmit={save} className="px-4 pb-2 flex gap-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
            className="flex-1 px-2 py-1 border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md text-sm" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic"
            className="flex-1 px-2 py-1 border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md text-sm" />
          <button type="submit" className="text-xs px-3 py-1 rounded bg-[#611f69] text-white">Save</button>
        </form>
      ) : (
        <p className="px-4 pb-1.5 text-xs text-gray-500 dark:text-white/40 truncate">{current.topic || current.description || ''}</p>
      )}
      {invite ? <ChannelInviteModal channelId={current.id} channelName={current.name} onClose={() => setInvite(false)} /> : null}
    </div>
  );
}

function ChannelInviteModal({ channelId, channelName, onClose }) {
  const { current: workspace } = useWorkspace();
  const [members, setMembers] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    workspaceApi.members(workspace.id).then(setMembers).catch(() => setMembers([]));
  }, [workspace?.id]);

  async function add(userId) {
    setError('');
    try {
      await channelApi.addMember(channelId, userId);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  const options = members.filter((m) => !filter || m.user.displayName.toLowerCase().includes(filter.toLowerCase())).slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1A1D21] dark:text-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">Invite teammates to #{channelName}</h3>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search workspace members…"
          className="w-full border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-3 py-2 text-sm mb-2 outline-none" />
        <ul className="max-h-56 overflow-y-auto">
          {options.map((m) => (
            <li key={m.user.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/10">
              <span className="font-semibold text-sm flex-1 truncate">{m.user.displayName}</span>
              <button onClick={() => add(m.user.id)} className="text-xs px-2 py-1 rounded bg-[#611f69] text-white">Add</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function MembersDrawer({ open, onClose }) {
  const { current } = useChannels();
  const { presence } = usePresence();
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (open && current) channelApi.members(current.id).then(setMembers).catch(() => setMembers([]));
  }, [open, current?.id]);

  if (!open || !current) return null;
  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white dark:bg-[#1A1D21] dark:text-white dark:border-l dark:border-white/10 shadow-xl border-l border-gray-200 z-40 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold">{current.isPrivate ? '🔒' : '#'} {current.name}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/40 mb-3">{current.topic || current.description || 'No topic set.'}</p>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm">Members · {members.length}</h3>
      </div>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm">
            <div className="relative">
              <div className="w-7 h-7 rounded bg-[#4A154B] text-white flex items-center justify-center text-xs font-bold">
                {(m.display_name || '?').slice(0, 1).toUpperCase()}
              </div>
              <span title={presence[m.id]?.state || 'OFFLINE'}
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#1A1D21] ${presence[m.id] ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{m.display_name}</p>
              <p className="text-xs text-gray-500 dark:text-white/40">{m.role} · {m.status}</p>
            </div>
          </li>
        ))}
      </ul>
      <Link to="/settings" onClick={onClose} className="block mt-4 text-xs text-[#1264A3] dark:text-sky-300 hover:underline">Workspace settings →</Link>
    </div>
  );
}
