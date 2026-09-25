import React, { useEffect, useState } from 'react';
import { checkAppUpdates, IN_APP } from '../../services/api.js';

// In-app changelog/update banner (Phase 10). The /updates/latest feed is
// env-driven server-side; electron-updater handles silent installs when a
// feed URL is configured, this banner covers manual/changelog flow.
export default function UpdateBanner() {
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    checkAppUpdates()
      .then((r) => {
        if (alive && r?.available) setInfo(r);
      })
      .catch(() => {});
    const off = window.teamchat?.system?.onUpdate?.((ev) => {
      if (alive && ev?.kind === 'available') setInfo((prev) => prev || { version: ev.version, notes: '', url: '' });
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  if (!info || dismissed) return null;
  return (
    <div className="shrink-0 bg-[#1264A3] text-white text-xs px-4 py-1.5 flex items-center gap-3">
      <span className="flex-1 truncate">
        🎉 TeamChat {info.version} is available{info.notes ? ` — ${String(info.notes).slice(0, 120)}` : ''}{IN_APP ? '' : ' (desktop app)'}
      </span>
      {info.url ? (
        <a href={info.url} target="_blank" rel="noreferrer" className="underline font-semibold">Download</a>
      ) : null}
      <button onClick={() => setDismissed(true)} className="opacity-70 hover:opacity-100">Dismiss</button>
    </div>
  );
}
