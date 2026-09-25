import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth.store.jsx';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useChannels } from '../../stores/channel.store.jsx';
import { useDMs } from '../../stores/dm.store.jsx';
import { usePresence } from '../../stores/presence.store.jsx';
import { useCall } from '../../stores/call.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';
import { channelApi } from '../../services/channels.js';
import { callsApi } from '../../services/calls.js';
import { botsApi } from '../../services/advanced.js';
import { onRealtime } from '../../services/socket.js';
import { NewDMModal } from '../direct-messages/DMList.jsx';

function presenceColor(status) {
  if (status === 'ONLINE') return 'bg-green-500';
  if (status === 'AWAY') return 'bg-yellow-500';
  if (status === 'DO_NOT_DISTURB') return 'bg-red-500';
  return 'bg-gray-400';
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1A1D21] dark:text-white dark:border dark:border-white/10 text-[#1d1c1d] rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Real-Slack sidebar (column 2): workspace header, conversation finder,
// Huddles, Channels, Direct messages, Agents & apps.
export default function SlackSidebar() {
  const { user, logout } = useAuth();
  const { workspaces, current: workspace, switchTo, refresh: refreshWorkspaces } = useWorkspace();
  const { channels, currentId, select, refresh: refreshChannels } = useChannels();
  const { dms, currentDmId, select: selectDm, refresh: refreshDms, patchDm } = useDMs();
  const { presence, notifUnread } = usePresence();
  const { join: joinCall } = useCall();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [compose, setCompose] = useState(false);
  const [find, setFind] = useState('');
  const [browse, setBrowse] = useState(false);
  const [create, setCreate] = useState(false);
  const [invite, setInvite] = useState(false);
  const [liveCall, setLiveCall] = useState(null);
  const [bots, setBots] = useState([]);

  useEffect(() => {
    if (workspace?.id) {
      refreshChannels(workspace.id).catch(() => {});
      refreshDms(workspace.id).catch(() => {});
      checkHuddle();
      botsApi.list(workspace.id).then(setBots).catch(() => setBots([]));
    }
  }, [workspace?.id]);

  useEffect(() => {
    const offs = [onRealtime('call.started', checkHuddle), onRealtime('call.ended', checkHuddle)];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  async function checkHuddle() {
    try {
      const calls = await callsApi.active(workspace.id);
      setLiveCall(calls[0] || null);
    } catch {
      setLiveCall(null);
    }
  }

  const f = find.trim().toLowerCase();
  const visibleChannels = f ? channels.filter((c) => c.name.toLowerCase().includes(f)) : channels;
  const visibleDms = f ? dms.filter((d) => dmTitle(d).toLowerCase().includes(f)) : dms;

  function dmTitle(dm) {
    if (dm.isGroup) return dm.name || 'Group message';
    const other = (dm.members || []).find((m) => m.userId !== user.id);
    return other?.displayName || dm.name || 'Direct message';
  }

  function openChannel(id) {
    select(workspace.id, id);
    nav('/');
  }

  function openDm(id) {
    selectDm(id);
    nav(`/dm/${id}`);
  }

  async function signOut() {
    await logout();
    nav('/login');
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Workspace header */}
      <div className="relative px-3 pt-2 pb-1 flex items-center gap-1">
        <button onClick={() => setMenu((m) => !m)} className="flex-1 text-left min-w-0 rounded-md px-2 py-1 hover:bg-white/10">
          <p className="font-bold text-[17px] truncate leading-tight">{workspace ? workspace.name : 'No workspace'} <span className="text-white/50 text-sm">⌄</span></p>
        </button>
        <Link to="/settings" title="Workspace settings" className="p-1.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white">⚙</Link>
        <button onClick={() => setCompose(true)} title="New message" className="p-1.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white">✎</button>
        {menu ? (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="absolute left-2 right-2 top-full mt-1 bg-white dark:bg-[#1A1D21] dark:border-white/10 text-[#1d1c1d] dark:text-white rounded-lg shadow-xl border border-gray-200 py-2 z-40">
              {workspaces.map((w) => (
                <button key={w.id} onClick={() => { switchTo(w.id); setMenu(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/10 ${w.id === workspace?.id ? 'font-bold' : ''}`}>
                  {w.name}<span className="ml-2 text-xs text-gray-400">{w.role}</span>
                </button>
              ))}
              <div className="border-t border-gray-100 dark:border-white/10 mt-2 pt-2 px-2 space-y-1">
                <Link to="/settings" onClick={() => setMenu(false)} className="block px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-white/10">Settings</Link>
                <Link to="/profile" onClick={() => setMenu(false)} className="block px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-white/10">Profile</Link>
                <button onClick={signOut} className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-white/10">Sign out</button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {/* Finder */}
        <div className="px-1 py-1.5">
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a conversation…"
            className="w-full bg-white/10 placeholder-white/50 rounded-md text-sm px-3 py-1.5 outline-none focus:bg-white/15" />
        </div>

        {/* Huddles */}
        <button onClick={() => liveCall && joinCall(workspace.id, liveCall.channelId ? { channelId: liveCall.channelId } : { dmConversationId: liveCall.dmConversationId })}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[15px] text-white/70 hover:bg-white/10 hover:text-white">
          🎧 <span className="flex-1 text-left">Huddles</span>
          {liveCall ? <span className="text-[11px] font-bold text-green-300">● LIVE</span> : null}
        </button>

        {/* Channels */}
        <p className="px-3 pb-1 pt-3 text-xs font-semibold text-white/50 flex items-center">Channels</p>
        <ul className="space-y-0.5">
          {visibleChannels.map((c) => (
            <li key={c.id}>
              <button onClick={() => openChannel(c.id)}
                className={`w-full text-left px-3 py-1 rounded-md text-[15px] truncate flex items-center gap-1 ${
                  c.id === currentId ? 'bg-white/20 text-white font-semibold' : c.unreadCount > 0 ? 'text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}>
                <span className="truncate">{c.isPrivate ? '🔒' : '#'} {c.name}</span>
                {c.unreadCount > 0 ? (
                  <span className="ml-auto shrink-0 text-[11px] font-bold bg-white text-[#3F0E40] rounded-full px-1.5">{c.unreadCount}</span>
                ) : null}
              </button>
            </li>
          ))}
          {visibleChannels.length === 0 ? <li className="px-3 text-sm text-white/40">No matches</li> : null}
          <li>
            <button onClick={() => setBrowse(true)} className="w-full text-left px-3 py-1 rounded-md text-[15px] text-white/60 hover:bg-white/10 hover:text-white">+ Add channels</button>
          </li>
        </ul>

        {/* Direct messages */}
        <p className="px-3 pb-1 pt-3 text-xs font-semibold text-white/50">Direct messages</p>
        <ul className="space-y-0.5">
          {visibleDms.map((dm) => {
            const other = !dm.isGroup ? (dm.members || []).find((m) => m.userId !== user.id) : null;
            const dot = other ? presence[other.userId]?.state || other.status || 'OFFLINE' : null;
            const title = dmTitle(dm);
            return (
              <li key={dm.id}>
                <button onClick={() => openDm(dm.id)}
                  className={`w-full text-left px-3 py-1 rounded-md text-[15px] truncate flex items-center gap-2 ${
                    dm.id === currentDmId ? 'bg-white/20 text-white font-semibold' : dm.unreadCount > 0 ? 'text-white font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}>
                  <span className="relative shrink-0">
                    <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[11px] font-bold">
                      {dm.isGroup ? '👥' : (title.slice(0, 1).toUpperCase() || '?')}
                    </span>
                    {dot ? <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#3F0E40] ${presenceColor(dot)}`} /> : null}
                  </span>
                  <span className="truncate flex-1">{title}{isSelfDm(dm) ? <span className="text-white/40 font-normal"> you</span> : null}</span>
                  {dm.unreadCount > 0 ? (
                    <span className="ml-auto shrink-0 text-[11px] font-bold bg-white text-[#3F0E40] rounded-full px-1.5">{dm.unreadCount}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {visibleDms.length === 0 ? <li className="px-3 text-sm text-white/40">No conversations yet</li> : null}
          <li>
            <button onClick={() => setInvite(true)} className="w-full text-left px-3 py-1 rounded-md text-[15px] text-white/60 hover:bg-white/10 hover:text-white">+ Invite people</button>
          </li>
        </ul>

        {/* Agents & apps */}
        <p className="px-3 pb-1 pt-3 text-xs font-semibold text-white/50">Agents & apps</p>
        <ul className="space-y-0.5">
          <li>
            <Link to="/apps" className="w-full flex items-center gap-2 text-left px-3 py-1 rounded-md text-[15px] text-white/70 hover:bg-white/10 hover:text-white">
              <span>🔌</span><span className="flex-1 truncate">Slack</span>
              {notifUnread > 0 ? <span className="text-[11px] font-bold bg-red-500 text-white rounded-full px-1.5">{notifUnread > 9 ? '9+' : notifUnread}</span> : null}
            </Link>
          </li>
          {bots.slice(0, 5).map((b) => (
            <li key={b.id}>
              <Link to="/apps" className="w-full flex items-center gap-2 text-left px-3 py-1 rounded-md text-[15px] text-white/70 hover:bg-white/10 hover:text-white">
                <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[11px] font-bold shrink-0">🤖</span>
                <span className="truncate flex-1">{b.name}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link to="/apps" className="w-full block text-left px-3 py-1 rounded-md text-[15px] text-white/60 hover:bg-white/10 hover:text-white">+ Connect apps</Link>
          </li>
        </ul>
      </div>

      {compose && workspace ? (
        <NewDMModal workspaceId={workspace.id} onClose={() => setCompose(false)}
          onCreated={(dm) => { patchDm(dm); setCompose(false); selectDm(dm.id); nav(`/dm/${dm.id}`); }} />
      ) : null}
      {browse ? <BrowseModal onClose={() => setBrowse(false)} onCreate={() => { setBrowse(false); setCreate(true); }} /> : null}
      {create ? <CreateModal onClose={() => setCreate(false)} onOpenBrowse={() => { setCreate(false); setBrowse(true); }} /> : null}
      {invite ? <InviteModal onClose={() => setInvite(false)} /> : null}
    </div>
  );

  function isSelfDm(dm) {
    if (dm.isGroup) return false;
    const ids = (dm.members || []).map((m) => m.userId);
    return ids.length === 1 && ids[0] === user.id;
  }
}

function BrowseModal({ onClose, onCreate }) {
  const { current: workspace } = useWorkspace();
  const { channels, refresh, select } = useChannels();
  const nav = useNavigate();
  const [error, setError] = useState('');

  async function join(id) {
    try {
      await channelApi.join(id);
      await refresh(workspace.id);
      select(workspace.id, id);
      onClose();
      nav('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Browse channels" onClose={onClose}>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <button onClick={onCreate} className="w-full text-sm px-4 py-2 rounded bg-[#611f69] text-white mb-2">Create a channel</button>
      <ul className="space-y-1 max-h-80 overflow-y-auto">
        {channels.filter((c) => !c.isPrivate).map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/10">
            <span className="font-bold">#</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{c.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.description || 'No description'}</p>
            </div>
            <button onClick={() => join(c.id)} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20">Join</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function CreateModal({ onClose, onOpenBrowse }) {
  const { current: workspace } = useWorkspace();
  const { refresh, select } = useChannels();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    try {
      const ch = await channelApi.create(workspace.id, { name: name.toLowerCase(), description, isPrivate });
      await refresh(workspace.id);
      select(workspace.id, ch.id);
      onClose();
      nav('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Create a channel" onClose={onClose}>
      <form onSubmit={create}>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (lowercase, e.g. backend)"
          className="w-full border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-3 py-2 text-sm mb-2 outline-none" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
          className="w-full border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-3 py-2 text-sm mb-2 outline-none" />
        <label className="flex items-center gap-2 text-sm my-2">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private (invite only)
        </label>
        <button type="submit" className="w-full text-sm px-4 py-2 rounded bg-[#611f69] text-white">Create</button>
        <button type="button" onClick={onOpenBrowse} className="w-full text-xs mt-2 text-[#1264A3] dark:text-sky-300 hover:underline">or browse channels</button>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose }) {
  const { current: workspace } = useWorkspace();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function invite(e) {
    e.preventDefault();
    setError('');
    try {
      const inv = await workspaceApi.invite(workspace.id, { email: email || undefined, role: 'member' });
      setCode(inv.token);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={`Invite people to ${workspace?.name || ''}`} onClose={onClose}>
      <form onSubmit={invite}>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        {code ? (
          <p className="text-sm bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded p-2 mb-2 break-all">
            Share this invite code: <code className="font-bold">{code}</code>
          </p>
        ) : null}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)"
          className="w-full border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-3 py-2 text-sm mb-2 outline-none" />
        <button className="w-full text-sm px-4 py-2 rounded bg-[#611f69] text-white">Create invite</button>
      </form>
    </Modal>
  );
}
