import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useChannels } from '../../stores/channel.store.jsx';
import { channelApi } from '../../services/channels.js';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';

// Slack-style channel header + members drawer + settings actions.
export function ChannelHeader({ onMembers }) {
  const { current: workspace } = useWorkspace();
  const { current, refresh } = useChannels();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');

  useEffect(() => {
    setDescription(current?.description || '');
    setTopic(current?.topic || '');
  }, [current?.id]);

  if (!current) return null;
  const canManage = workspace && ['owner', 'admin'].includes(workspace.role);

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
  }

  async function unarchive() {
    await channelApi.unarchive(current.id);
    await refresh(workspace.id);
  }

  async function leave() {
    if (!window.confirm(`Leave #${current.name}?`)) return;
    await channelApi.leave(current.id);
    await refresh(workspace.id);
  }

  async function destroy() {
    if (!window.confirm(`Delete #${current.name} forever?`)) return;
    await channelApi.remove(current.id);
    await refresh(workspace.id);
  }

  return (
    <div className="px-5 py-3 border-b border-gray-200">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-lg">{current.isPrivate ? '🔒' : '#'} {current.name}</h2>
        {current.isArchived ? <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold">archived</span> : null}
        <div className="flex-1" />
        <button onClick={onMembers} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">
          👥 {current.memberCount ?? ''} members
        </button>
        {canManage && !current.isArchived ? <button onClick={archive} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">Archive</button> : null}
        {canManage && current.isArchived ? <button onClick={unarchive} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">Unarchive</button> : null}
        {current.slug !== 'general' ? <button onClick={leave} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">Leave</button> : null}
        {canManage && current.slug !== 'general' ? <button onClick={destroy} className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50">Delete</button> : null}
        {canManage ? <button onClick={() => setEditing((v) => !v)} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">Edit</button> : null}
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{current.topic || current.description || 'Add a topic'}</p>
      {editing ? (
        <form onSubmit={save} className="mt-2 flex gap-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
            className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic"
            className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-sm" />
          <button type="submit" className="text-xs px-3 py-1 rounded bg-[#611f69] text-white">Save</button>
        </form>
      ) : null}
    </div>
  );
}

export function MembersDrawer({ open, onClose }) {
  const { current } = useChannels();
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (open && current) channelApi.members(current.id).then(setMembers).catch(() => setMembers([]));
  }, [open, current?.id]);

  if (!open || !current) return null;
  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-xl border-l border-gray-200 z-40 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">Members · {members.length}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm">
            <div className="w-7 h-7 rounded bg-[#4A154B] text-white flex items-center justify-center text-xs font-bold">
              {(m.display_name || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{m.display_name}</p>
              <p className="text-xs text-gray-500">{m.role} · {m.status}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
