import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';
import { appVersion, setApiBase, BASE, IN_APP } from '../../services/api.js';

function DesktopSection() {
  const [version, setVersion] = useState('');
  const [update, setUpdate] = useState(null);
  const [logs, setLogs] = useState(null);
  const [apiUrl, setApiUrl] = useState(BASE);
  const [msg, setMsg] = useState('');
  const bridge = typeof window !== 'undefined' ? window.teamchat : null;

  React.useEffect(() => {
    appVersion().then(setVersion).catch(() => {});
  }, []);

  async function check() {
    setMsg('');
    try {
      const r = await bridge?.system?.checkUpdates?.();
      setUpdate(r);
      if (!r?.available) setMsg('You are up to date.');
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function showLogs() {
    const r = await bridge?.system?.logsTail?.(100).catch(() => null);
    setLogs(r);
  }

  async function reveal() {
    await bridge?.system?.logsReveal?.().catch(() => {});
  }

  async function saveApi(e) {
    e.preventDefault();
    setApiBase(apiUrl.trim());
    try {
      await bridge?.system?.setConfig?.({ apiUrl: apiUrl.trim() });
    } catch {}
    setMsg('API server saved — restart the app to reconnect.');
  }

  if (!IN_APP) return null;
  return (
    <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 mb-4">
      <h3 className="text-sm font-bold mb-1">Desktop app</h3>
      <p className="text-xs text-gray-500 dark:text-white/40 mb-3">Version {version || '…'} · logs + updates live here, like Slack's preferences.</p>
      {msg ? <p className="mb-2 text-sm text-gray-700">{msg}</p> : null}
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={check} className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">Check for updates</button>
        <button onClick={showLogs} className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">View logs</button>
        <button onClick={reveal} className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">Open log folder</button>
      </div>
      {update?.available ? (
        <p className="text-xs text-green-700 mb-2">Update {update.version} available{update.notes ? ` — ${String(update.notes).slice(0, 100)}` : ''}.</p>
      ) : null}
      {logs ? (
        <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-md p-2 max-h-40 overflow-y-auto mb-3 whitespace-pre-wrap">{logs.lines?.join('\n') || '(empty)'}</pre>
      ) : null}
      <form onSubmit={saveApi} className="flex gap-2">
        <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs" placeholder="API server URL" />
        <button className="text-xs px-3 py-1.5 rounded bg-[#611f69] text-white">Save</button>
      </form>
    </div>
  );
}

// Slack-style workspace settings (rename / delete).
export default function Settings() {
  const { current, refresh, switchTo } = useWorkspace();
  const nav = useNavigate();
  const [name, setName] = useState(current?.name || '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  React.useEffect(() => { setName(current?.name || ''); }, [current?.id]);

  if (!current) return <p className="p-6">Create or join a workspace first.</p>;
  const isOwner = current.role === 'owner';
  const canManage = ['owner', 'admin'].includes(current.role);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await workspaceApi.patch(current.id, { name });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Save failed');
    }
  }

  async function destroy() {
    if (!window.confirm(`Delete "${current.name}" forever?`)) return;
    try {
      await workspaceApi.remove(current.id);
      await refresh();
      nav('/');
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  }

  return (
    <div className="p-6 max-w-xl font-sans text-[#1d1c1d] dark:text-white">
      <h2 className="text-xl font-bold mb-1">Workspace settings</h2>
      <p className="text-sm text-gray-500 dark:text-white/40 mb-4">Your role: <strong>{current.role}</strong> · slug: <code>{current.slug}</code></p>
      <DesktopSection />
      {error ? <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div> : null}
      {saved ? <div className="mb-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">Saved.</div> : null}
      {canManage ? (
        <form onSubmit={save} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 mb-4">
          <label className="text-sm font-semibold">Workspace name</label>
          <Field value={name} onChange={(e) => setName(e.target.value)} />
          <PrimaryButton type="submit">Save changes</PrimaryButton>
        </form>
      ) : (
        <p className="text-sm text-gray-500 dark:text-white/40 mb-4">Only admins can change settings.</p>
      )}
      {isOwner ? (
        <div className="bg-white border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-red-700 mb-1">Danger zone</h3>
          <p className="text-xs text-gray-500 dark:text-white/40 mb-2">Deleting a workspace removes everything in it.</p>
          <button onClick={destroy} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Delete workspace</button>
        </div>
      ) : null}
    </div>
  );
}
