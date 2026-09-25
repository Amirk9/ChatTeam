import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecentSearches, pushRecentSearch } from '../../services/search.js';

// Slack-style top-bar search: Ctrl+K focus, recent searches, type-ahead hint.
export default function SearchBar({ workspaceId, workspaceName }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submit(e) {
    e?.preventDefault();
    const query = q.trim();
    if (!query || !workspaceId) return;
    pushRecentSearch(query);
    setOpen(false);
    inputRef.current?.blur();
    nav(`/search?q=${encodeURIComponent(query)}`);
  }

  const recent = getRecentSearches();

  return (
    <div className="relative w-full max-w-xl">
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={workspaceId ? `Search ${workspaceName}` : 'Search messages, files, channels, people  (Ctrl+K)'}
          className="w-full bg-white/10 hover:bg-white/20 focus:bg-white focus:text-black rounded-md text-sm px-3 py-1 text-white placeholder-white/60 outline-none"
        />
      </form>
      {open && recent.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-[#222529] dark:border-white/10 text-black dark:text-white rounded-lg shadow-xl py-1 z-30 border border-transparent">
          <p className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase">Recent searches</p>
          {recent.map((r) => (
            <button
              key={r}
              onMouseDown={(e) => { e.preventDefault(); setQ(r); pushRecentSearch(r); setOpen(false); nav(`/search?q=${encodeURIComponent(r)}`); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-white/10 truncate"
            >
              🔍 {r}
            </button>
          ))}
          <p className="px-3 py-1 text-[11px] text-gray-400">Tips: from:@user · in:#channel · "exact phrase" · has:file · before:2026-09-01 · after:2026-08-01</p>
        </div>
      )}
    </div>
  );
}
