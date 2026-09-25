import React, { useState } from 'react';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { useChannels } from '../../stores/channel.store.jsx';
import { channelApi } from '../../services/channels.js';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white text-[#1d1c1d] rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Slack-style channel list for the sidebar + create/browse dialogs.
export function ChannelList() {
  const { current: workspace } = useWorkspace();
  const { channels, currentId, select, refresh } = useChannels();
  const [mode, setMode] = useState(null); // 'create' | 'browse'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState('');

  if (!workspace) return null;

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const ch = await channelApi.create(workspace.id, { name, description, isPrivate });
      await refresh(workspace.id);
      select(workspace.id, ch.id);
      setMode(null);
      setName('');
      setDescription('');
      setIsPrivate(false);
    } catch (err) {
      setError(err.message || 'Could not create channel');
    }
  }

  async function join(id) {
    setError('');
    try {
      await channelApi.join(id);
      await refresh(workspace.id);
      select(workspace.id, id);
      setMode(null);
    } catch (err) {
      setError(err.message || 'Could not join channel');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-3 pb-1">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Channels</p>
        <div className="flex gap-1">
          <button title="Browse channels" onClick={() => { setMode('browse'); setError(''); }} className="text-white/50 hover:text-white text-sm px-1">☰</button>
          <button title="Create channel" onClick={() => { setMode('create'); setError(''); }} className="text-white/50 hover:text-white text-sm px-1">+</button>
        </div>
      </div>
      <ul className="space-y-0.5">
        {channels.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => select(workspace.id, c.id)}
              className={`w-full text-left px-3 py-1 rounded-md text-[15px] truncate ${
                c.id === currentId ? 'bg-[#1164A3] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {c.isPrivate ? '🔒' : '#'} {c.name}
              {c.isArchived ? <span className="text-xs opacity-60"> (archived)</span> : null}
            </button>
          </li>
        ))}
        {channels.length === 0 ? <li className="px-3 text-sm text-white/40">No channels yet</li> : null}
      </ul>

      {mode === 'create' ? (
        <Modal title="Create a channel" onClose={() => setMode(null)}>
          <form onSubmit={create}>
            {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
            <Field placeholder="Name (lowercase, e.g. backend)" value={name} onChange={(e) => setName(e.target.value)} />
            <Field placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <label className="flex items-center gap-2 text-sm my-2">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              Private (invite only)
            </label>
            <PrimaryButton type="submit">Create</PrimaryButton>
          </form>
        </Modal>
      ) : null}

      {mode === 'browse' ? (
        <Modal title="Browse channels" onClose={() => setMode(null)}>
          {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {channels.filter((c) => !c.isPrivate).map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100">
                <span className="font-bold">#</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 truncate">{c.description || 'No description'} · {c.memberCount ?? ''} members</p>
                </div>
                <button onClick={() => join(c.id)} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">Join</button>
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </div>
  );
}
