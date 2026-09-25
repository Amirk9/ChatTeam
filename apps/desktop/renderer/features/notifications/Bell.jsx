import React, { useState } from 'react';
import { usePresence } from '../../stores/presence.store.jsx';

// Slack-style notification bell: unread badge + dropdown + sound toggle.
export default function Bell() {
  const { notifications, notifUnread, markAllRead, sound, toggleSound } = usePresence();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Notifications"
        className="relative w-7 h-7 rounded hover:bg-white/10 text-white/80 flex items-center justify-center">
        🔔
        {notifUnread > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {notifUnread > 99 ? '99+' : notifUnread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-9 w-80 max-h-96 overflow-y-auto bg-white dark:bg-[#1A1D21] dark:text-white dark:border-white/10 text-[#1d1c1d] rounded-lg shadow-xl border border-gray-200 z-50">
          <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-white/10">
            <p className="font-bold text-sm flex-1">Notifications</p>
            <button onClick={toggleSound} title="Toggle sound" className="text-sm mr-2">{sound ? '🔊' : '🔇'}</button>
            <button onClick={() => { markAllRead(); }} className="text-xs text-[#1264A3] dark:text-sky-300 hover:underline">Mark all read</button>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 dark:text-white/40 text-center">You're all caught up.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {notifications.map((n) => (
                <li key={n.id} className={`px-4 py-2.5 text-sm ${n.is_read ? 'text-gray-500 dark:text-white/40' : 'bg-blue-50/50 dark:bg-blue-900/20'}`}>
                  <p className="font-semibold">
                    {n.type === 'mention' ? '@ Mention' : n.type === 'thread_reply' ? 'Thread reply' : n.type}
                    {!n.is_read ? <span className="ml-2 inline-block w-2 h-2 rounded-full bg-blue-500" /> : null}
                  </p>
                  <p className="text-xs text-gray-500">{n.workspace_name || ''} · {new Date(n.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
