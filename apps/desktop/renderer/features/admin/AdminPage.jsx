import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { adminApi } from '../../services/advanced.js';

const TABS = ['audit', 'users', 'sessions', 'usage'];

// Enterprise admin dashboard (Slack admin parity): audit trail, directory,
// sessions/devices, usage. Backend gates everything on VIEW_AUDIT_LOG.
export default function AdminPage() {
  const { current: workspace } = useWorkspace();
  const [tab, setTab] = useState('audit');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workspace) return;
    setData(null);
    setError('');
    const run = { audit: adminApi.audit, users: adminApi.users, sessions: adminApi.sessions, usage: adminApi.usage }[tab];
    run(workspace.id).then(setData).catch((err) => setError(err.message));
  }, [workspace?.id, tab]);

  const denied = error.includes('VIEW_AUDIT_LOG') || error.includes('Forbidden');

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
      <h2 className="text-xl font-bold mb-1">Admin</h2>
      <p className="text-sm text-gray-500 mb-3">Compliance, directory and usage for {workspace?.name}.</p>
      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`text-xs px-3 py-1 rounded-full border capitalize ${tab === t ? 'bg-[#611f69] text-white border-[#611f69]' : 'border-gray-300 hover:bg-gray-100'}`}>
            {t}
          </button>
        ))}
      </div>
      {denied ? (
        <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md p-3">🔒 Admins and owners only — ask for the <code>VIEW_AUDIT_LOG</code> permission.</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : tab === 'audit' ? (
        <AuditTable rows={data.audit} />
      ) : tab === 'users' ? (
        <UsersTable rows={data.users} />
      ) : tab === 'sessions' ? (
        <SessionsTable rows={data.sessions} />
      ) : (
        <UsageGrid usage={data.usage} />
      )}
    </div>
  );
}

function AuditTable({ rows }) {
  if (!rows?.length) return <p className="text-sm text-gray-400">No audit entries yet — privileged actions (role changes, removals, channel deletes) land here.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-gray-400 border-b"><th className="py-1">When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="border-b border-gray-100">
            <td className="py-1.5 text-xs text-gray-500">{new Date(a.created_at).toLocaleString()}</td>
            <td>{a.actor || '—'}</td>
            <td><code className="text-xs bg-gray-100 rounded px-1">{a.action}</code></td>
            <td className="text-xs text-gray-500">{a.target_type || ''} {a.target_id?.slice(0, 8) || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UsersTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-gray-400 border-b"><th className="py-1">Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
      <tbody>
        {(rows || []).map((u) => (
          <tr key={u.id} className="border-b border-gray-100">
            <td className="py-1.5 font-semibold">{u.display_name}</td>
            <td className="text-xs text-gray-500">{u.email}</td>
            <td><span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{u.role}</span></td>
            <td className="text-xs">{u.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SessionsTable({ rows }) {
  if (!rows?.length) return <p className="text-sm text-gray-400">No active sessions.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-gray-400 border-b"><th className="py-1">User</th><th>Device</th><th>IP</th><th>Since</th></tr></thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id} className="border-b border-gray-100">
            <td className="py-1.5">{s.display_name}</td>
            <td className="text-xs text-gray-500">{s.device_info || '—'}</td>
            <td className="text-xs text-gray-500">{s.ip || '—'}</td>
            <td className="text-xs text-gray-500">{new Date(s.created_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UsageGrid({ usage }) {
  const cells = Object.entries(usage || {});
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {cells.map(([k, v]) => (
        <div key={k} className="border border-gray-200 rounded-lg p-3">
          <p className="text-2xl font-bold">{typeof v === 'number' ? v.toLocaleString() : v}</p>
          <p className="text-xs text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
        </div>
      ))}
    </div>
  );
}
