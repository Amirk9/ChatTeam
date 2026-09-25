import React, { useState } from 'react';
import { useChannels } from '../../stores/channel.store.jsx';
import { shareFile } from '../../services/files.js';

// Slack-style share-to-channel dialog (plan 07: share file to channel/thread).
export default function ShareDialog({ fileId, filename, onClose, onShared }) {
  const { channels } = useChannels();
  const [channelId, setChannelId] = useState(channels[0]?.id || '');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!channelId || busy) return;
    setBusy(true);
    setError('');
    try {
      const msg = await shareFile(fileId, { channelId, content: content.trim() || undefined });
      onShared?.(msg);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-96 max-w-[90vw] bg-white dark:bg-[#1A1D21] dark:text-white rounded-lg shadow-xl p-4">
        <h3 className="font-bold mb-1">Share file</h3>
        <p className="text-xs text-gray-500 dark:text-white/40 mb-3 truncate">📎 {filename}</p>
        <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1">Channel</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-2 py-1.5 text-sm mb-3">
          {channels.map((c) => (
            <option key={c.id} value={c.id}># {c.name}{c.isPrivate ? ' 🔒' : ''}</option>
          ))}
        </select>
        <label className="block text-xs font-semibold text-gray-600 dark:text-white/60 mb-1">Message (optional)</label>
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Say something about this file..." className="w-full border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-2 py-1.5 text-sm mb-3" />
        {error ? <p className="text-xs text-red-600 mb-2">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-white/15">Cancel</button>
          <button type="submit" disabled={busy || !channelId} className="text-xs px-3 py-1.5 rounded bg-[#611f69] text-white disabled:opacity-40">
            {busy ? 'Sharing...' : 'Share'}
          </button>
        </div>
      </form>
    </div>
  );
}
