import React, { useEffect, useState } from 'react';
import { useCall } from '../../stores/call.store.jsx';
import { callsApi } from '../../services/calls.js';
import { onRealtime } from '../../services/socket.js';

// Slack-style huddle button: green "live" pill when a call runs here,
// headphone toggle otherwise. Lives in channel + DM headers.
export default function HuddleButton({ workspaceId, target }) {
  const { join } = useCall();
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  async function check() {
    try {
      const calls = await callsApi.active(workspaceId);
      const key = target.channelId ? ['channelId', target.channelId] : ['dmConversationId', target.dmConversationId];
      setLive(calls.some((c) => String(c[key[0]]) === String(key[1])));
    } catch {}
  }

  useEffect(() => {
    check();
    const offs = [onRealtime('call.started', check), onRealtime('call.ended', check)];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, target.channelId, target.dmConversationId]);

  async function start() {
    setBusy(true);
    try {
      await join(workspaceId, target);
      setLive(true);
    } finally {
      setBusy(false);
    }
  }

  if (live) {
    return (
      <button onClick={start} disabled={busy} className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-semibold hover:bg-green-200">
        🎧 Huddle live — Join
      </button>
    );
  }
  return (
    <span className="relative">
      <button onClick={() => setMenu((m) => !m)} disabled={busy} title="Huddle" className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-white/15 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-1">
        🎧 Huddle <span className="text-[10px]">⌄</span>
      </button>
      {menu ? (
        <>
          <span className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          <span className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#1A1D21] dark:border-white/10 rounded-lg shadow-xl border border-gray-200 py-1 z-40 text-sm block">
            <button onClick={() => { setMenu(false); start(); }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10 text-[#1d1c1d] dark:text-white">🎧 Start huddle</button>
            <button onClick={() => { setMenu(false); try { navigator.clipboard.writeText(`${window.location.origin}/?huddle=1`); } catch {} }}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10 text-[#1d1c1d] dark:text-white">🔗 Copy huddle link</button>
          </span>
        </>
      ) : null}
    </span>
  );
}
