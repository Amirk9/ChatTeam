import React, { useEffect, useRef, useState } from 'react';
import { useMessages } from '../../stores/message.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';

const EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀', '✅', '🔥', '👏', '🙏', '💯'];

// Slack-style composer: @mention autocomplete, emoji picker, code button.
export default function Composer({ channel, workspaceId, replyTo = null, onSent, mini = false }) {
  const { send, refreshThread, openThread } = useMessages();
  const [text, setText] = useState('');
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState(null); // mention filter after last @
  const [hi, setHi] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    workspaceApi.members(workspaceId).then(setMembers).catch(() => setMembers([]));
  }, [workspaceId]);

  function trackMention(v) {
    const m = v.slice(0, boxRef.current?.selectionStart ?? v.length).match(/@([\w.+-]*)$/);
    if (m) {
      setQuery(m[1].toLowerCase());
      setHi(0);
    } else {
      setQuery(null);
    }
  }

  const matches = query === null ? [] : members.filter((x) =>
    x.user.displayName.toLowerCase().includes(query) || x.user.email.toLowerCase().includes(query)
  ).slice(0, 5);

  function insertMention(m) {
    const el = boxRef.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@[\w.+-]*$/, `@${m.user.email} `);
    setText(before + text.slice(pos));
    setQuery(null);
    el?.focus();
  }

  function insertCode() {
    setText((t) => `${t}\n\`\`\`\ncode here\n\`\`\`\n`);
    boxRef.current?.focus();
  }

  function onKey(e) {
    if (query !== null && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter' && matches[hi]) {
        if (e.key === 'Tab') { e.preventDefault(); insertMention(matches[hi]); return; }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function submit() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const msg = await send(channel.id, { content, parentMessageId: replyTo });
      setText('');
      setQuery(null);
      if (replyTo) {
        await openThread(channel.id, replyTo).catch(() => refreshThread());
      }
      onSent?.(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={mini ? '' : 'p-4'}>
      <div className="border border-gray-300 rounded-lg relative">
        {query !== null && matches.length > 0 ? (
          <div className="absolute bottom-full mb-1 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
            {matches.map((m, i) => (
              <button key={m.user.id} onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                className={`w-full text-left px-3 py-1.5 text-sm ${i === hi ? 'bg-[#1164A3] text-white' : 'hover:bg-gray-100'}`}>
                <span className="font-semibold">{m.user.displayName}</span>
                <span className={`text-xs ml-2 ${i === hi ? 'text-white/70' : 'text-gray-400'}`}>{m.user.email}</span>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={boxRef}
          value={text}
          rows={mini ? 2 : 3}
          onChange={(e) => { setText(e.target.value); trackMention(e.target.value); }}
          onKeyDown={onKey}
          placeholder={replyTo ? 'Reply to thread...' : `Message #${channel.name}`}
          className="w-full px-4 py-3 text-sm outline-none resize-none rounded-t-lg"
        />
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-gray-100 text-gray-500 text-sm relative">
          <button onClick={() => setShowEmoji((s) => !s)} className="hover:bg-gray-100 rounded px-1.5 py-0.5" title="Emoji">😊</button>
          <button onClick={insertCode} className="hover:bg-gray-100 rounded px-1.5 py-0.5 font-mono text-xs" title="Code block">{'</>'}</button>
          <span className="text-xs text-gray-400 ml-1">**bold** *italic* `code` @mention supported</span>
          <div className="flex-1" />
          <button onClick={submit} disabled={busy || !text.trim()} className="text-xs px-3 py-1 rounded bg-[#611f69] text-white disabled:opacity-40">Send</button>
          {showEmoji ? (
            <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-6 gap-0.5 z-20">
              {EMOJI.map((e) => (
                <button key={e} onClick={() => { setText((t) => t + e); setShowEmoji(false); }} className="text-xl hover:bg-gray-100 rounded p-0.5">{e}</button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
