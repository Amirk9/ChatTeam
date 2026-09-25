import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth.store.jsx';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useDMs } from '../../stores/dm.store.jsx';
import { usePresence } from '../../stores/presence.store.jsx';
import { dmApi } from '../../services/dms.js';
import { workspaceApi } from '../../services/workspaces.js';

function presenceColor(status) {
  if (status === 'ONLINE') return 'bg-green-500';
  if (status === 'AWAY') return 'bg-yellow-500';
  if (status === 'DO_NOT_DISTURB') return 'bg-red-500';
  return 'bg-gray-400';
}

function dmTitle(dm, meId) {
  if (dm.isGroup) return dm.name || 'Group message';
  const other = (dm.members || []).find((m) => m.userId !== meId);
  return other?.displayName || dm.name || 'Direct message';
}

// Slack-style DM section: presence dots, unread badges, new-DM modal.
export function DMList() {
  const { user } = useAuth();
  const { current: workspace } = useWorkspace();
  const { dms, currentDmId, select, refresh, patchDm } = useDMs();
  const { presence } = usePresence();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (workspace?.id) refresh(workspace.id).catch(() => {});
  }, [workspace?.id, refresh]);

  function openDm(id) {
    select(id);
    nav(`/dm/${id}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-1">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Direct messages</p>
        <button title="New direct message" onClick={() => setOpen(true)} className="text-white/50 hover:text-white text-sm px-1">+</button>
      </div>
      <ul className="space-y-0.5">
        {dms.map((dm) => {
          const other = !dm.isGroup ? (dm.members || []).find((m) => m.userId !== user.id) : null;
          const dot = other ? presence[other.userId]?.state || other.status || 'OFFLINE' : null;
          return (
            <li key={dm.id}>
              <button
                onClick={() => openDm(dm.id)}
                className={`w-full text-left px-3 py-1 rounded-md text-[15px] truncate flex items-center gap-2 ${
                  dm.id === currentDmId ? 'bg-[#1164A3] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="relative shrink-0">
                  <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[11px] font-bold">
                    {dm.isGroup ? '👥' : (dmTitle(dm, user.id).slice(0, 1).toUpperCase() || '?')}
                  </span>
                  {dot ? <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#3F0E40] ${presenceColor(dot)}`} /> : null}
                </span>
                <span className="truncate flex-1">{dmTitle(dm, user.id)}</span>
                {dm.unreadCount > 0 ? (
                  <span className="ml-auto shrink-0 text-[11px] font-bold bg-white text-[#3F0E40] rounded-full px-1.5">{dm.unreadCount}</span>
                ) : null}
              </button>
            </li>
          );
        })}
        {dms.length === 0 ? <li className="px-3 text-sm text-white/40">No conversations yet</li> : null}
      </ul>
      {open ? <NewDMModal workspaceId={workspace.id} onClose={() => setOpen(false)} onCreated={(dm) => { patchDm(dm); setOpen(false); openDm(dm.id); }} /> : null}
    </div>
  );
}

function NewDMModal({ workspaceId, onClose, onCreated }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    workspaceApi.members(workspaceId).then(setMembers).catch(() => setMembers([]));
  }, [workspaceId]);

  const options = members
    .filter((m) => m.user.id !== user.id)
    .filter((m) => !filter || m.user.displayName.toLowerCase().includes(filter.toLowerCase()) || m.user.email.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 20);

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 20)));
  }

  async function create(e) {
    e.preventDefault();
    if (!picked.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const dm = await dmApi.create(workspaceId, { userIds: picked, ...(picked.length > 1 && name.trim() ? { name: name.trim() } : {}) });
      onCreated(dm);
    } catch (err) {
      setError(err.message || 'Could not start conversation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white text-[#1d1c1d] rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">New direct message</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={create}>
          {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search people..." className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2 outline-none focus:ring-2 focus:ring-[#611f69]" />
          <ul className="max-h-56 overflow-y-auto border border-gray-200 rounded-md mb-2">
            {options.map((m) => (
              <li key={m.user.id}>
                <label className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={picked.includes(m.user.id)} onChange={() => toggle(m.user.id)} />
                  <span className="font-semibold truncate">{m.user.displayName}</span>
                  <span className="text-xs text-gray-400 truncate">{m.user.email}</span>
                </label>
              </li>
            ))}
            {options.length === 0 ? <li className="px-3 py-2 text-sm text-gray-400">No matches</li> : null}
          </ul>
          {picked.length > 1 ? (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name (optional)" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2 outline-none focus:ring-2 focus:ring-[#611f69]" />
          ) : null}
          <button type="submit" disabled={busy || !picked.length} className="w-full text-sm px-4 py-2 rounded bg-[#611f69] text-white disabled:opacity-40">
            {busy ? 'Starting...' : picked.length > 1 ? `Start group message (${picked.length + 1})` : 'Message'}
          </button>
        </form>
      </div>
    </div>
  );
}
