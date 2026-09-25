import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { usePresence } from '../../stores/presence.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';

const ROLE_COLORS = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  moderator: 'bg-green-100 text-green-800',
  member: 'bg-gray-100 text-gray-700',
  guest: 'bg-yellow-100 text-yellow-800',
  bot: 'bg-gray-200 text-gray-600',
};

// Slack-style members directory with invites + role management.
export default function Members() {
  const { current } = useWorkspace();
  const { presence } = usePresence();
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!current) return;
    setLoading(true);
    try {
      setMembers(await workspaceApi.members(current.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [current?.id]);

  async function invite(e) {
    e.preventDefault();
    setError('');
    setInviteCode('');
    try {
      const inv = await workspaceApi.invite(current.id, { email: email || undefined, role });
      setInviteCode(inv.token);
      setEmail('');
      load();
    } catch (err) {
      setError(err.message || 'Invite failed');
    }
  }

  async function changeRole(userId, next) {
    setError('');
    try {
      await workspaceApi.setRole(current.id, userId, next);
      load();
    } catch (err) {
      setError(err.message || 'Role change failed');
    }
  }

  async function remove(userId) {
    if (!window.confirm('Remove this member?')) return;
    setError('');
    try {
      await workspaceApi.removeMember(current.id, userId);
      load();
    } catch (err) {
      setError(err.message || 'Remove failed');
    }
  }

  if (!current) return <p className="p-6">Create or join a workspace first.</p>;
  const canManage = ['owner', 'admin'].includes(current.role);

  return (
    <div className="p-6 max-w-3xl font-sans">
      <h2 className="text-xl font-bold mb-1">Members of {current.name}</h2>
      <p className="text-sm text-gray-500 mb-4">Invite teammates, assign roles, remove members — like Slack.</p>
      {error ? <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div> : null}

      <form onSubmit={invite} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional — blank = shareable link)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#611f69]" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {['member', 'guest', 'moderator', 'admin'].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" className="px-4 py-2 rounded-lg bg-[#611f69] hover:bg-[#4A154B] text-white text-sm font-semibold">Invite</button>
      </form>
      {inviteCode ? (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 break-all">
          Invite code (share it): <strong>{inviteCode}</strong>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-gray-500">Loading members...</p> : (
        <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {members.map((m) => (
            <li key={m.user.id} className="px-4 py-3 flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-md bg-[#4A154B] text-white flex items-center justify-center font-bold">
                  {(m.user.displayName || '?').slice(0, 1).toUpperCase()}
                </div>
                <span title={presence[m.user.id]?.state || 'OFFLINE'}
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${presence[m.user.id] ? 'bg-green-500' : 'bg-gray-300'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{m.user.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{m.user.email}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role] || 'bg-gray-100'}`}>{m.role}</span>
              {canManage && m.role !== 'owner' ? (
                <>
                  <select value={m.role} onChange={(e) => changeRole(m.user.id, e.target.value)} className="text-xs border border-gray-300 rounded-md px-1 py-1">
                    {['member', 'guest', 'moderator', 'admin'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button onClick={() => remove(m.user.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
