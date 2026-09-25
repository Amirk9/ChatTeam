import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../stores/auth.store.jsx';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useDMs } from '../../stores/dm.store.jsx';
import { useMessages } from '../../stores/message.store.jsx';
import { usePresence } from '../../stores/presence.store.jsx';
import { dmApi } from '../../services/dms.js';
import { workspaceApi } from '../../services/workspaces.js';
import MessageItem, { dayOf } from '../messages/MessageItem.jsx';
import Composer from '../messages/Composer.jsx';
import ThreadPane from '../messages/ThreadPane.jsx';

// Slack-style DM pane: header + feed + composer + read receipts + thread.
export default function DMPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { current: workspace } = useWorkspace();
  const { dms, currentDmId, select, refresh, byDm, load, patchDm } = useDMs();
  const { openThread } = useMessages();
  const { presence, typing } = usePresence();
  const [members, setMembers] = useState([]);
  const [manage, setManage] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (workspace?.id && !dms.length) refresh(workspace.id).catch(() => {});
  }, [workspace?.id, dms.length, refresh]);

  useEffect(() => {
    if (id && id !== currentDmId) select(id);
  }, [id, currentDmId, select]);

  const dm = dms.find((d) => d.id === id) || dms.find((d) => d.id === currentDmId) || null;
  const feed = byDm[dm?.id] || { messages: [], nextCursor: null };
  const messages = feed.messages;

  useEffect(() => {
    if (dm?.id && !byDm[dm.id]) load(dm.id).catch(() => {});
    if (dm?.id) dmApi.members(dm.id).then(setMembers).catch(() => setMembers([]));
  }, [dm?.id, byDm, load]);

  // Slack read receipts: mark read at newest; show who has seen our messages.
  useEffect(() => {
    if (!dm || !messages.length) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
    const last = messages[messages.length - 1];
    const t = setTimeout(() => {
      dmApi.markRead(dm.id, last.id).catch(() => {});
      if (workspace?.id) refresh(workspace.id).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [dm?.id, messages.length, workspace?.id, refresh]);

  const others = useMemo(() => (members.length ? members.filter((m) => m.userId !== user.id) : (dm?.members || []).filter((m) => m.userId !== user.id)), [members, dm, user.id]);
  const title = dm?.isGroup ? dm.name || 'Group message' : others[0]?.displayName || 'Direct message';
  const peerStatus = !dm?.isGroup && others[0] ? presence[others[0].userId]?.state || others[0].status || 'OFFLINE' : null;

  const typists = Object.values(typing[`dm:${dm?.id}`] || {}).map((t) => t.displayName).filter(Boolean);

  const seenBy = useMemo(() => {
    if (!messages.length || !others.length) return [];
    const mine = [...messages].reverse().find((m) => m.sender.id === user.id && !m.deleted);
    if (!mine) return [];
    return others.filter((o) => o.lastReadAt && new Date(o.lastReadAt) >= new Date(mine.createdAt)).map((o) => o.displayName);
  }, [messages, others, user.id]);

  async function more() {
    if (feed.nextCursor) await load(dm.id, feed.nextCursor);
  }

  if (!workspace) return <p className="p-8 text-sm text-gray-500">Select a workspace first.</p>;
  if (!dm) return <p className="p-8 text-sm text-gray-500">Loading conversation...</p>;

  return (
    <div className="flex-1 flex min-h-0 min-w-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-[#4A154B] text-white flex items-center justify-center font-bold shrink-0">
            {dm.isGroup ? '👥' : (title.slice(0, 1).toUpperCase() || '?')}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold truncate">{title}</h2>
            <p className="text-xs text-gray-500 truncate">
              {dm.isGroup ? `${others.length + 1} members` : peerStatus || 'Offline'}
              {seenBy.length ? ` · ✓✓ Seen by ${seenBy.join(', ')}` : ''}
            </p>
          </div>
          <button onClick={() => setManage(true)} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Members</button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {feed.nextCursor ? (
            <button onClick={more} className="mx-auto block text-xs text-[#1264A3] hover:underline mb-2">Load older messages</button>
          ) : null}
          {messages.map((m, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const showDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
            const compact = Boolean(prev && !prev.deleted && !m.deleted && prev.sender.id === m.sender.id && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000 && !m.parentMessageId);
            return (
              <React.Fragment key={m.id}>
                {showDay ? (
                  <div className="flex items-center gap-3 px-5 my-3">
                    <div className="flex-1 border-t border-gray-200" />
                    <span className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-full px-3 py-0.5">{dayOf(m.createdAt)}</span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                ) : null}
                <MessageItem message={m} channelId={null} onReply={(rootId) => openThread(dm.id, rootId)} compact={compact} />
              </React.Fragment>
            );
          })}
          {messages.length === 0 ? (
            <div className="px-5 py-6 max-w-2xl">
              <h3 className="text-xl font-bold mb-1">This is the very beginning of your conversation with {title}</h3>
              <p className="text-sm text-gray-500">Messages, files, emoji reactions and threads all work here — just like channels.</p>
            </div>
          ) : null}
          <div ref={bottomRef} />
          {typists.length > 0 ? (
            <p className="px-5 py-1 text-xs text-gray-500 italic">{typists.join(', ')} {typists.length === 1 ? 'is' : 'are'} typing...</p>
          ) : null}
        </div>

        <Composer dm={{ id: dm.id, name: title }} workspaceId={workspace.id} onSent={() => refresh(workspace.id)} />
      </div>
      <ThreadPane channel={{ id: dm.id, name: title }} dm={{ id: dm.id, name: title }} workspaceId={workspace.id} />
      {manage ? <ManageModal dm={dm} members={members} onClose={() => setManage(false)} onChange={async () => {
        const full = await dmApi.get(dm.id).catch(() => null);
        if (full) patchDm(full);
        dmApi.members(dm.id).then(setMembers).catch(() => {});
        if (workspace?.id) refresh(workspace.id).catch(() => {});
      }} onLeave={() => nav('/')} /> : null}
    </div>
  );
}

function ManageModal({ dm, members, onClose, onChange, onLeave }) {
  const { user } = useAuth();
  const [name, setName] = useState(dm.name || '');
  const [email, setEmail] = useState('');
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    workspaceApi.members(dm.workspaceId).then(setOptions).catch(() => setOptions([]));
  }, [dm.workspaceId]);

  const suggestions = email
    ? options.filter((m) => !members.some((x) => x.userId === m.user.id) && (m.user.displayName.toLowerCase().includes(email.toLowerCase()) || m.user.email.toLowerCase().includes(email.toLowerCase()))).slice(0, 5)
    : [];

  async function rename(e) {
    e.preventDefault();
    setError('');
    try {
      await dmApi.rename(dm.id, name.trim());
      onChange();
    } catch (err) { setError(err.message); }
  }

  async function add(userId) {
    setError('');
    try {
      await dmApi.addMember(dm.id, userId);
      setEmail('');
      onChange();
    } catch (err) { setError(err.message); }
  }

  async function remove(userId) {
    setError('');
    try {
      await dmApi.removeMember(dm.id, userId);
      if (userId === user.id) { onClose(); onLeave(); return; }
      onChange();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{dm.isGroup ? 'Group details' : 'Conversation details'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        {dm.isGroup ? (
          <form onSubmit={rename} className="flex gap-2 mb-4">
            <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm" placeholder="Group name" />
            <button className="text-xs px-3 py-1.5 rounded bg-[#611f69] text-white">Save</button>
          </form>
        ) : <p className="text-sm text-gray-500 mb-4">1-1 conversations are fixed between two people — like Slack.</p>}
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Members ({members.length})</p>
        <ul className="space-y-1 max-h-48 overflow-y-auto mb-3">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-gray-50">
              <span className="font-semibold flex-1 truncate">{m.displayName} {m.userId === user.id ? '(you)' : ''}</span>
              <span className="text-xs text-gray-400">{m.status}</span>
              {dm.isGroup ? <button onClick={() => remove(m.userId)} className="text-xs text-red-600 hover:underline">Remove</button> : null}
            </li>
          ))}
        </ul>
        {dm.isGroup ? (
          <div className="relative">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add people by name or email..." className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            {suggestions.length > 0 ? (
              <ul className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                {suggestions.map((s) => (
                  <li key={s.user.id}>
                    <button onClick={() => add(s.user.id)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100">
                      <span className="font-semibold">{s.user.displayName}</span>
                      <span className="text-xs text-gray-400 ml-2">{s.user.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
