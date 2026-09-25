import React, { useEffect, useRef, useState } from 'react';
import { useMessages } from '../../stores/message.store.jsx';
import { useDMs } from '../../stores/dm.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';
import { typingEmit, dmTypingEmit } from '../../stores/presence.store.jsx';
import { uploadFiles, pickFiles, formatSize } from '../../services/files.js';
import { sendWithOutbox } from '../../services/outbox.js';
const EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀', '✅', '🔥', '👏', '🙏', '💯'];

// Slack-style composer: @mention autocomplete, emoji picker, code button.
// Channel mode: <Composer channel workspaceId />. DM mode: <Composer dm workspaceId />.
export default function Composer({ channel, dm, workspaceId, replyTo = null, onSent, mini = false }) {
  const { send, refreshThread, openThread } = useMessages();
  const dmStore = useDMs();
  const target = dm || channel;
  const isDm = Boolean(dm);
  const [text, setText] = useState('');
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState(null); // mention filter after last @
  const [hi, setHi] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queuedNote, setQueuedNote] = useState(false);
  const [pending, setPending] = useState([]); // {id?, name, size, progress, error}
  const [dragOver, setDragOver] = useState(false);
  const boxRef = useRef(null);
  const fileInput = useRef(null);
  const lastType = useRef(0);

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
    const done = pending.filter((p) => p.id);
    const content = text.trim() || done.map((p) => p.name).join(', ');
    if ((!content && !done.length) || busy || pending.some((p) => p.uploading)) return;
    setBusy(true);
    if (isDm) dmTypingEmit(dm.id, 'stop');
    else typingEmit(channel.id, 'stop');
    try {
      const input = { content, parentMessageId: replyTo, attachmentIds: done.map((p) => p.id) };
      const msg = isDm
        ? await sendWithOutbox('dm', dm.id, input, (id, body) => dmStore.send(id, body))
        : await sendWithOutbox('channel', channel.id, input, (id, body) => send(id, body));
      setText('');
      setPending([]);
      setQuery(null);
      setQueuedNote(Boolean(msg?.queued));
      if (replyTo && !msg?.queued) {
        await openThread(target.id, replyTo).catch(() => refreshThread());
      }
      onSent?.(msg);
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(list) {
    const files = [...list].slice(0, 5 - pending.length);
    for (const f of files) {
      const entry = { key: `${Date.now()}-${f.name}`, name: f.name, size: f.size, progress: 0, uploading: true, error: '' };
      setPending((p) => [...p, entry]);
      try {
        const uploaded = await uploadFiles(workspaceId, [f], (r) => {
          setPending((p) => p.map((x) => (x.key === entry.key ? { ...x, progress: r } : x)));
        });
        setPending((p) => p.map((x) => (x.key === entry.key ? { ...x, uploading: false, progress: 1, id: uploaded[0].id } : x)));
      } catch (err) {
        setPending((p) => p.map((x) => (x.key === entry.key ? { ...x, uploading: false, error: err.message } : x)));
      }
    }
  }

  async function attachClicked() {
    const native = await pickFiles();
    if (native) {
      addFiles(native);
    } else {
      fileInput.current?.click();
    }
  }

  return (
    <div className={mini ? '' : 'p-4'}>
      <div
        className={`border rounded-lg relative ${dragOver ? 'border-[#611f69] ring-2 ring-[#611f69]' : 'border-gray-300'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); }}
      >
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        {pending.length > 0 ? (
          <div className="px-3 pt-2 space-y-1">
            {pending.map((p) => (
              <div key={p.key} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                <span className="font-semibold truncate flex-1">📎 {p.name} <span className="text-gray-400 font-normal">({formatSize(p.size)})</span></span>
                {p.error ? <span className="text-red-600">{p.error}</span> : null}
                {p.uploading ? (
                  <progress value={p.progress} max={1} className="w-20 h-1.5 accent-[#611f69]" />
                ) : null}
                <button onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))} className="text-gray-400 hover:text-gray-600">×</button>
              </div>
            ))}
          </div>
        ) : null}
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
          onChange={(e) => {
            setText(e.target.value);
            trackMention(e.target.value);
            if (Date.now() - lastType.current > 2500 && e.target.value.trim()) {
              lastType.current = Date.now();
              if (isDm) dmTypingEmit(dm.id, 'start');
              else typingEmit(channel.id, 'start');
            }
          }}
          onKeyDown={onKey}
          placeholder={replyTo ? 'Reply to thread...' : isDm ? `Message ${dm.name || 'this conversation'}` : `Message #${channel.name}`}
          className="w-full px-4 py-3 text-sm outline-none resize-none rounded-t-lg"
        />
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-gray-100 text-gray-500 text-sm relative">
          <button onClick={() => setShowEmoji((s) => !s)} className="hover:bg-gray-100 rounded px-1.5 py-0.5" title="Emoji">😊</button>
          <button onClick={attachClicked} className="hover:bg-gray-100 rounded px-1.5 py-0.5" title="Attach files">📎</button>
          <button onClick={insertCode} className="hover:bg-gray-100 rounded px-1.5 py-0.5 font-mono text-xs" title="Code block">{'</>'}</button>
          <span className="text-xs text-gray-400 ml-1 hidden sm:inline">**bold** *italic* `code` @mention supported</span>
          {queuedNote ? <span className="text-xs text-yellow-700 ml-1">Queued — will send on reconnect</span> : null}
          <div className="flex-1" />
          <button onClick={submit} disabled={busy || (!text.trim() && !pending.some((p) => p.id)) || pending.some((p) => p.uploading)} className="text-xs px-3 py-1 rounded bg-[#611f69] text-white disabled:opacity-40">Send</button>
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
