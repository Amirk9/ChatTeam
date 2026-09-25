import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';

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
    <div className="p-6 max-w-xl font-sans">
      <h2 className="text-xl font-bold mb-1">Workspace settings</h2>
      <p className="text-sm text-gray-500 mb-4">Your role: <strong>{current.role}</strong> · slug: <code>{current.slug}</code></p>
      {error ? <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div> : null}
      {saved ? <div className="mb-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">Saved.</div> : null}
      {canManage ? (
        <form onSubmit={save} className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <label className="text-sm font-semibold">Workspace name</label>
          <Field value={name} onChange={(e) => setName(e.target.value)} />
          <PrimaryButton type="submit">Save changes</PrimaryButton>
        </form>
      ) : (
        <p className="text-sm text-gray-500 mb-4">Only admins can change settings.</p>
      )}
      {isOwner ? (
        <div className="bg-white border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-red-700 mb-1">Danger zone</h3>
          <p className="text-xs text-gray-500 mb-2">Deleting a workspace removes everything in it.</p>
          <button onClick={destroy} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Delete workspace</button>
        </div>
      ) : null}
    </div>
  );
}
