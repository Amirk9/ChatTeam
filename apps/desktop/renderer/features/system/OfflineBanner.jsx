import React, { useEffect, useState } from 'react';
import { readOutbox, flushOutbox } from '../../services/outbox.js';
import { useMessages } from '../../stores/message.store.jsx';
import { useDMs } from '../../stores/dm.store.jsx';

// Slack-style connectivity banner: offline state + queued-send count,
// flushes automatically when the browser reports online again.
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [queued, setQueued] = useState(() => readOutbox().length);
  const { send: sendChannel } = useMessages();
  const { send: sendDm } = useDMs();

  useEffect(() => {
    const update = () => {
      const up = navigator.onLine;
      setOnline(up);
      setQueued(readOutbox().length);
      if (up) flushOutbox({ sendChannel, sendDm }).then(() => setQueued(readOutbox().length)).catch(() => {});
    };
    const onBox = () => setQueued(readOutbox().length);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('teamchat:outbox', onBox);
    const t = setInterval(() => {
      if (navigator.onLine && readOutbox().length) update();
    }, 15000);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('teamchat:outbox', onBox);
      clearInterval(t);
    };
  }, [sendChannel, sendDm]);

  if (online && !queued) return null;
  return (
    <div className={`shrink-0 text-center text-xs px-3 py-1 ${online ? 'bg-yellow-100 text-yellow-900' : 'bg-red-600 text-white'}`}>
      {!online ? 'No connection — messages will queue and send when you reconnect.' : `${queued} message${queued === 1 ? '' : 's'} queued — sending…`}
    </div>
  );
}
