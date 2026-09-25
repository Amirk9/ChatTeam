import React, { useState } from 'react';
import { useAuth } from '../../stores/auth.store.jsx';
import { authApi } from '../../services/api.js';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';

// Slack-style profile editor.
export default function Profile() {
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [status, setStatus] = useState(user.status || 'ONLINE');
  const [customStatus, setCustomStatus] = useState(user.customStatus || '');
  const [timezone, setTimezone] = useState(user.timezone || '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      const updated = await authApi.updateMe({ displayName, status, customStatus: customStatus || null, timezone: timezone || null });
      setUser(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Save failed');
    }
  }

  return (
    <div className="p-6 max-w-xl font-sans text-[#1d1c1d] dark:text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-xl bg-[#4A154B] text-white flex items-center justify-center text-2xl font-bold">
          {(user.displayName || '?').slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-bold">{user.displayName}</h2>
          <p className="text-sm text-gray-500 dark:text-white/40">{user.email}{user.emailVerified ? ' · verified' : ' · unverified'}</p>
        </div>
      </div>
      {error ? <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div> : null}
      {saved ? <div className="mb-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">Profile saved.</div> : null}
      <form onSubmit={save} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 space-y-1">
        <label className="text-sm font-semibold">Display name</label>
        <Field value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label className="text-sm font-semibold">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="block w-full my-2 px-3 py-2.5 border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-lg text-sm">
          <option value="ONLINE">Online</option>
          <option value="AWAY">Away</option>
          <option value="DO_NOT_DISTURB">Do not disturb</option>
          <option value="OFFLINE">Offline</option>
        </select>
        <label className="text-sm font-semibold">Custom status</label>
        <Field placeholder="e.g. In a meeting" value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} />
        <label className="text-sm font-semibold">Timezone</label>
        <Field placeholder="e.g. Asia/Kolkata" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        <PrimaryButton type="submit">Save profile</PrimaryButton>
      </form>
    </div>
  );
}
