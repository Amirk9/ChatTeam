import React, { useState } from 'react';
import { useAuth } from '../../stores/auth.store.jsx';
import { useMessages } from '../../stores/message.store.jsx';
import { useDMs } from '../../stores/dm.store.jsx';
import { messageApi } from '../../services/messages.js';
import { botsApi } from '../../services/advanced.js';
import { Markdown } from './Markdown.jsx';
import { AttachmentList } from '../files/Attachments.jsx';

const QUICK_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀', '✅'];

export function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayOf(iso) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function MessageItem({ message, channelId, onReply, compact, highlight }) {
  const { user } = useAuth();
  const { patchMessage, refreshThread, threadRootId } = useMessages();
  const dmStore = useDMs();
  // DM messages (channelId null + dmConversationId) patch into the DM store.
  const dmId = message.dmConversationId || null;
  const applyPatch = (msg) => {
    if (dmId) dmStore.patchMessage(dmId, msg);
    else patchMessage(channelId, msg);
  };
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content || '');
  const [picking, setPicking] = useState(false);
  const [clicking, setClicking] = useState(null);
  const mine = message.sender.id === user.id;

  async function clickButton(b) {
    setClicking(b.id);
    try {
      await botsApi.click(message.id, b.id);
    } finally {
      setClicking(null);
    }
  }

  async function toggle(emoji, has) {
    const updated = has
      ? await messageApi.unreact(message.id, emoji)
      : await messageApi.react(message.id, emoji);
    applyPatch(updated);
    if (threadRootId && (threadRootId === message.id || threadRootId === message.parentMessageId)) refreshThread();
  }

  async function saveEdit(e) {
    e.preventDefault();
    const updated = await messageApi.edit(message.id, draft);
    applyPatch(updated);
    if (threadRootId) refreshThread();
    setEditing(false);
  }

  async function remove() {
    if (!window.confirm('Delete this message?')) return;
    const res = await messageApi.remove(message.id);
    applyPatch(res.message || { ...message, deleted: true, content: null });
    if (threadRootId) refreshThread();
  }

  if (message.deleted) {
    return (
      <div className="px-5 py-1 text-sm text-gray-400 italic">
        {mine ? 'You deleted this message.' : 'This message was deleted.'}
        {message.replyCount ? <span className="not-italic"> · {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}</span> : null}
      </div>
    );
  }

  return (
    <div id={`msg-${message.id}`} className={`px-5 py-1.5 hover:bg-gray-50 group relative ${compact ? '' : 'mt-2'} ${highlight ? 'bg-yellow-100 ring-2 ring-yellow-400 rounded' : ''}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPicking(false); }}>
      <div className="flex gap-3">
        {compact ? (
          <span className="w-9 shrink-0 text-[11px] text-gray-400 pt-1">{hover ? timeOf(message.createdAt) : ''}</span>
        ) : (
          <div className="w-9 h-9 shrink-0 rounded-md bg-[#4A154B] text-white flex items-center justify-center font-bold">
            {(message.sender.displayName || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {!compact ? (
            <p className="text-sm">
              <span className="font-bold mr-2">{message.sender.displayName}</span>
              <span className="text-xs text-gray-400">{timeOf(message.createdAt)}</span>
              {message.edited ? <span className="text-xs text-gray-400 ml-1">(edited)</span> : null}
            </p>
          ) : null}
          {editing ? (
            <form onSubmit={saveEdit} className="mt-1">              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-[#611f69]" />
              <div className="flex gap-2 mt-1">
                <button type="submit" className="text-xs px-3 py-1 rounded bg-[#611f69] text-white">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="text-xs px-3 py-1 rounded border border-gray-300">Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <Markdown text={message.content} />
              <AttachmentList attachments={message.attachments} />
            </>
          )}
          {message.reactions?.length ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {message.reactions.map((r) => (
                <button key={r.emoji} onClick={() => toggle(r.emoji, r.me)}
                  className={`text-xs px-2 py-0.5 rounded-full border ${r.me ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200 hover:border-gray-400'}`}>
                  {r.emoji} {r.count}
                </button>
              ))}
            </div>
          ) : null}
          {message.buttons?.length ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {message.buttons.map((b) => (
                <button key={b.id} onClick={() => clickButton(b)} disabled={clicking === b.id}
                  className="text-xs px-3 py-1 rounded-md border border-[#611f69] text-[#611f69] hover:bg-[#611f69] hover:text-white disabled:opacity-50">
                  {clicking === b.id ? '…' : b.label}
                </button>
              ))}
            </div>
          ) : null}
          {message.replyCount && !message.parentMessageId ? (
            <button onClick={() => onReply(message.id)} className="text-xs text-[#1264A3] hover:underline mt-1">
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'} →
            </button>
          ) : null}
        </div>
      </div>

      {hover && !editing ? (
        <div className="absolute -top-3 right-4 flex bg-white border border-gray-200 rounded-md shadow-sm text-sm">
          <button title="React" onClick={() => setPicking((p) => !p)} className="px-2 py-0.5 hover:bg-gray-100 rounded-l-md">😊</button>
          <button title="Reply in thread" onClick={() => onReply(message.parentMessageId || message.id)} className="px-2 py-0.5 hover:bg-gray-100">💬</button>
          {mine ? <button title="Edit" onClick={() => { setDraft(message.content); setEditing(true); }} className="px-2 py-0.5 hover:bg-gray-100">✏️</button> : null}
          <button title="Delete" onClick={remove} className="px-2 py-0.5 hover:bg-gray-100 rounded-r-md">🗑️</button>
        </div>
      ) : null}
      {picking ? (
        <div className="absolute top-6 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex gap-0.5 z-10">
          {QUICK_EMOJI.map((e) => (
            <button key={e} onClick={() => { toggle(e, message.reactions?.some((r) => r.emoji === e && r.me)); setPicking(false); }}
              className="text-lg px-1 hover:bg-gray-100 rounded">{e}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
