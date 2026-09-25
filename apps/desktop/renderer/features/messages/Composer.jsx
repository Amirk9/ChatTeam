import React, { useEffect, useRef, useState } from 'react';
import { useMessages } from '../../stores/message.store.jsx';
import { useDMs } from '../../stores/dm.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';
import { typingEmit, dmTypingEmit } from '../../stores/presence.store.jsx';
import { uploadFiles, pickFiles, formatSize } from '../../services/files.js';
import { sendWithOutbox } from '../../services/outbox.js';
const EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀', '✅', '🔥', '👏', '🙏', '💯'];

// Real-Slack composer: formatting toolbar on top, textarea, action row with
// attach/emoji/mention/huddle + send. Dark-first. Channel or DM mode.
export default function Composer({ channel, dm, workspaceId, replyTo = null, onSent, mini = false, onHuddle, onCanvas }) {
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

  // Welcome-card GIF button opens the emoji picker.
  useEffect(() => {
    const fn = () => setShowEmoji(true);
    window.addEventListener('teamchat:composer-emoji', fn);
    return () => window.removeEventListener('teamchat:composer-emoji', fn);
  }, []);

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

  // Markdown helpers operating on the textarea selection (Slack toolbar parity).
  function surround(before, after = before) {
    const el = boxRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = text.slice(s, e) || 'text';
    setText(text.slice(0, s) + before + sel + after + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }

  function prefixLines(prefix) {
    const el = boxRef.current;
    if (!el) return;
    const { selectionStart: s } = el;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    setText(text.slice(0, lineStart) + prefix + text.slice(lineStart));
    requestAnimationFrame(() => el.focus());
  }

  function insertLink() {
    const url = window.prompt('Link URL:');
    if (url) surround('[', `](${url})`);
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

  const toolBtn = 'px-1.5 py-0.5 rounded font-bold hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-white/70';

  return (
    <div className={mini ? '' : 'px-5 pb-4 pt-1'}>
      <div
        className={`rounded-xl border relative bg-white dark:bg-[#222529] dark:border-white/20 shadow-sm ${dragOver ? 'border-[#611f69] ring-2 ring-[#611f69]' : 'border-gray-300'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); }}
      >
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 px-3 pt-2 text-gray-600 dark:text-white/70 text-[15px]">
          <button onClick={() => surround('**')} title="Bold" className={toolBtn}>B</button>
          <button onClick={() => surround('*')} title="Italic" className={`${toolBtn} italic font-normal`}>I</button>
          <button onClick={() => surround('~')} title="Strikethrough" className={`${toolBtn} line-through`}>U</button>
          <button onClick={insertLink} title="Link" className={`${toolBtn} font-normal`}>🔗</button>
          <span className="w-px h-4 bg-gray-300 dark:bg-white/15 mx-1" />
          <button onClick={() => prefixLines('- ')} title="Bulleted list" className={`${toolBtn} font-normal`}>☰</button>
          <button onClick={() => prefixLines('1. ')} title="Numbered list" className={`${toolBtn} font-normal text-xs`}>1.</button>
          <button onClick={() => prefixLines('> ')} title="Quote" className={`${toolBtn} font-normal`}>❝</button>
          <button onClick={() => surround('`')} title="Inline code" className={`${toolBtn} font-mono font-normal text-sm`}>{'</>'}</button>
          <button onClick={insertCode} title="Code block" className={`${toolBtn} font-mono font-normal text-xs`}>{"{ }"}</button>
        </div>
        {pending.length > 0 ? (
          <div className="px-3 pt-2 space-y-1">
            {pending.map((p) => (
              <div key={p.key} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md px-2 py-1">
                <span className="font-semibold truncate flex-1">📎 {p.name} <span className="text-gray-400 font-normal">({formatSize(p.size)})</span></span>
                {p.error ? <span className="text-red-600">{p.error}</span> : null}
                {p.uploading ? (
                  <progress value={p.progress} max={1} className="w-20 h-1.5 accent-[#611f69]" />
                ) : null}
                <button onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">×</button>
              </div>
            ))}
          </div>
        ) : null}
        {query !== null && matches.length > 0 ? (
          <div className="absolute bottom-full mb-1 left-0 w-64 bg-white dark:bg-[#1A1D21] dark:border-white/10 border border-gray-200 rounded-lg shadow-lg py-1 z-20">
            {matches.map((m, i) => (
              <button key={m.user.id} onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                className={`w-full text-left px-3 py-1.5 text-sm ${i === hi ? 'bg-[#1164A3] text-white' : 'hover:bg-gray-100 dark:hover:bg-white/10'}`}>
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
          className="w-full px-4 py-2 text-[15px] outline-none resize-none bg-transparent text-[#1d1c1d] dark:text-white placeholder-gray-500 dark:placeholder-white/30"
        />
        {/* Action row */}
        <div className="flex items-center gap-0.5 px-3 pb-2 text-gray-500 dark:text-white/60 text-lg relative">
          <button onClick={attachClicked} title="Attach files" className="hover:bg-gray-100 dark:hover:bg-white/10 rounded-full w-7 h-7 flex items-center justify-center">＋</button>
          <button onClick={() => setShowEmoji((s) => !s)} title="Emoji" className="hover:bg-gray-100 dark:hover:bg-white/10 rounded px-1">😊</button>
          <button onClick={() => { setText((t) => `${t}@`); boxRef.current?.focus(); }} title="Mention" className="hover:bg-gray-100 dark:hover:bg-white/10 rounded px-1 text-base">@</button>
          {!isDm && !replyTo ? (
            <>
              <button onClick={onHuddle} title="Start huddle" className="hover:bg-gray-100 dark:hover:bg-white/10 rounded px-1 text-base">🎥</button>
              <button onClick={onCanvas} title="New canvas" className="hover:bg-gray-100 dark:hover:bg-white/10 rounded px-1 text-base">📝</button>
            </>
          ) : null}
          {queuedNote ? <span className="text-xs text-yellow-700 dark:text-yellow-300 ml-1">Queued — will send on reconnect</span> : null}
          <div className="flex-1" />
          <button onClick={submit} disabled={busy || (!text.trim() && !pending.some((p) => p.id)) || pending.some((p) => p.uploading)}
            title="Send" className="w-8 h-8 rounded-full bg-[#611f69] text-white flex items-center justify-center disabled:opacity-40 text-base">➤</button>
          {showEmoji ? (
            <div className="absolute bottom-full mb-1 left-0 bg-white dark:bg-[#1A1D21] dark:border-white/10 border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-6 gap-0.5 z-20">
              {EMOJI.map((e) => (
                <button key={e} onClick={() => { setText((t) => t + e); setShowEmoji(false); }} className="text-xl hover:bg-gray-100 dark:hover:bg-white/10 rounded p-0.5">{e}</button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
