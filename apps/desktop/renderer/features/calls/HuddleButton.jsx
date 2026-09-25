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
    <button onClick={start} disabled={busy} title="Start huddle" className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">
      🎧 Huddle
    </button>
  );
}
