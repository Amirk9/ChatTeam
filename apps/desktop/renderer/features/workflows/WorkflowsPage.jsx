import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { workflowsApi } from '../../services/advanced.js';
import { workspaceApi } from '../../services/workspaces.js';

// Slack-style Workflow Builder: list, run, and the onboarding template
// (new hire → channel → welcome → invite → notify HR).
export default function WorkflowsPage() {
  const { current: workspace } = useWorkspace();
  const [flows, setFlows] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState([]);
  const [hrId, setHrId] = useState('');

  async function load() {
    if (!workspace) return;
    try {
      setFlows(await workflowsApi.list(workspace.id));
      setMembers(await workspaceApi.members(workspace.id));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [workspace?.id]);

  async function run(id) {
    setError('');
    try {
      const r = await workflowsApi.run(id, {});
      setResult(r);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onboard(e) {
    e.preventDefault();
    setError('');
    try {
      const r = await workflowsApi.onboarding({ newUserEmail: email.trim(), hrUserId: hrId || null });
      setResult(r);
      setEmail('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto text-[#1d1c1d] dark:text-white">
      <h2 className="text-xl font-bold mb-1">Workflows</h2>
      <p className="text-sm text-gray-500 dark:text-white/40 mb-4">Trigger → steps → result automations, like Slack's Workflow Builder.</p>
      {error ? <p className="text-sm text-red-600 mb-2">{error}</p> : null}
      <form onSubmit={onboard} className="border border-gray-200 dark:border-white/10 rounded-xl p-4 mb-4">
        <h3 className="font-bold text-sm mb-1">👋 Employee onboarding template</h3>
        <p className="text-xs text-gray-500 dark:text-white/40 mb-2">Creates an onboarding channel, posts a welcome checklist, invites the hire, notifies HR.</p>
        <div className="flex flex-wrap gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new.hire@company.com" className="flex-1 min-w-52 border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-2 py-1.5 text-sm" />
          <select value={hrId} onChange={(e) => setHrId(e.target.value)} className="border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-2 py-1.5 text-sm">
            <option value="">No HR notify</option>
            {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.displayName}</option>)}
          </select>
          <button className="text-xs px-3 py-1.5 rounded bg-[#611f69] text-white">Run onboarding</button>
        </div>
      </form>
      {result ? (
        <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-md p-3 mb-4 overflow-x-auto">{JSON.stringify(result.results || result, null, 2)}</pre>
      ) : null}
      <ul className="space-y-2">
        {flows.map((f) => (
          <li key={f.id} className="border border-gray-200 dark:border-white/10 rounded-lg p-3 flex items-center gap-2">
            <div className="flex-1">
              <p className="font-semibold text-sm">⚙️ {f.name}</p>
              <p className="text-xs text-gray-400">{f.steps?.length || 0} steps · {f.description}</p>
            </div>
            <button onClick={() => run(f.id)} className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-white/15 hover:bg-gray-50 dark:hover:bg-white/10">Run</button>
          </li>
        ))}
        {flows.length === 0 ? <p className="text-sm text-gray-400">No workflows yet — run onboarding to create one.</p> : null}
      </ul>
    </div>
  );
}
