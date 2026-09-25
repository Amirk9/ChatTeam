import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { botsApi, integrationsApi } from '../../services/advanced.js';

// Slack-style Apps & integrations: bots + slash commands + incoming/outgoing webhooks.
export default function AppsPage() {
  const { current: workspace } = useWorkspace();
  const [bots, setBots] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    if (!workspace) return;
    try {
      const [b, i] = await Promise.all([botsApi.list(workspace.id), integrationsApi.list(workspace.id)]);
      setBots(b);
      setIntegrations(i);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [workspace?.id]);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto">
      <h2 className="text-xl font-bold mb-1">Apps & integrations</h2>
      <p className="text-sm text-gray-500 mb-4">Bots, slash commands and webhooks — like Slack's app directory.</p>
      {error ? <p className="text-sm text-red-600 mb-2">{error}</p> : null}
      <BotSection workspaceId={workspace?.id} bots={bots} onChange={load} />
      <IntegrationSection workspaceId={workspace?.id} integrations={integrations} onChange={load} />
      <div className="mt-4 border border-gray-200 rounded-xl p-4 text-sm">
        <h3 className="font-bold mb-1">Built-in slash commands</h3>
        <ul className="text-gray-600 space-y-1">
          <li><code>/meeting create [title]</code> — spin up a huddle + post a join card</li>
          <li><code>/github deploy &lt;env&gt;</code> — post a deploy notice (e.g. <code>/github deploy production</code>)</li>
          <li><code>/poll question?; option A; option B</code> — post a clickable poll</li>
        </ul>
      </div>
    </div>
  );
}

function BotSection({ workspaceId, bots, onChange }) {
  const [name, setName] = useState('');
  const [cmd, setCmd] = useState({});
  const [error, setError] = useState('');
  const [token, setToken] = useState('');

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await botsApi.create(workspaceId, name.trim());
      setToken(res.token);
      setName('');
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addCommand(botId) {
    const draft = cmd[botId] || {};
    if (!draft.command) return;
    setError('');
    try {
      await botsApi.addCommand(botId, {
        command: draft.command,
        description: draft.description || '',
        responseTemplate: draft.responseTemplate || `/${draft.command} by {{user}}: {{args}}`,
        buttons: [],
      });
      setCmd((c) => ({ ...c, [botId]: {} }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="border border-gray-200 rounded-xl p-4 mb-4">
      <h3 className="font-bold mb-2">Bots</h3>
      {error ? <p className="text-xs text-red-600 mb-2">{error}</p> : null}
      {token ? <p className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 mb-2 break-all">Bot token (copy now — shown once): <code>{token}</code></p> : null}
      <form onSubmit={create} className="flex gap-2 mb-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bot name, e.g. Deploybot" className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        <button className="text-xs px-3 py-1.5 rounded bg-[#611f69] text-white">Create bot</button>
      </form>
      <ul className="space-y-3">
        {bots.map((b) => (
          <li key={b.id} className="border border-gray-100 rounded-lg p-2">
            <p className="text-sm font-semibold">🤖 {b.name}</p>
            <div className="flex gap-1 mt-1">
              <input value={cmd[b.id]?.command || ''} onChange={(e) => setCmd((c) => ({ ...c, [b.id]: { ...c[b.id], command: e.target.value } }))} placeholder="command (e.g. standup)" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
              <input value={cmd[b.id]?.responseTemplate || ''} onChange={(e) => setCmd((c) => ({ ...c, [b.id]: { ...c[b.id], responseTemplate: e.target.value } }))} placeholder="Reply, {{user}} {{args}} work" className="flex-[2] border border-gray-200 rounded px-2 py-1 text-xs" />
              <button onClick={() => addCommand(b.id)} className="text-xs px-2 py-1 rounded border border-gray-300">Add /cmd</button>
            </div>
          </li>
        ))}
        {bots.length === 0 ? <p className="text-xs text-gray-400">No bots yet.</p> : null}
      </ul>
    </section>
  );
}

function IntegrationSection({ workspaceId, integrations, onChange }) {
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [hook, setHook] = useState(null);
  const [sub, setSub] = useState({});
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await integrationsApi.create(workspaceId, { name: name.trim(), provider: 'custom', channelId: channelId.trim() || null });
      setHook(res);
      setName('');
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function subscribe(id) {
    const draft = sub[id] || {};
    if (!draft.url) return;
    setError('');
    try {
      await integrationsApi.subscribe(id, { url: draft.url, events: ['message.created'] });
      setSub((s) => ({ ...s, [id]: {} }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="border border-gray-200 rounded-xl p-4">
      <h3 className="font-bold mb-2">Incoming webhooks & subscriptions</h3>
      {error ? <p className="text-xs text-red-600 mb-2">{error}</p> : null}
      {hook ? <p className="text-xs bg-green-50 border border-green-200 rounded p-2 mb-2 break-all">POST to <code>{hook.incomingUrl}</code> with <code>{'{ "text": "..." }'}</code> — GitHub push/PR payloads auto-format.</p> : null}
      <form onSubmit={create} className="flex gap-2 mb-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Integration name, e.g. GitHub" className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        <input value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="Channel ID (target)" className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        <button className="text-xs px-3 py-1.5 rounded bg-[#611f69] text-white">Create</button>
      </form>
      <ul className="space-y-2">
        {integrations.map((i) => (
          <li key={i.id} className="border border-gray-100 rounded-lg p-2">
            <p className="text-sm font-semibold">🔌 {i.name} <span className="text-xs text-gray-400">({i.provider})</span></p>
            <div className="flex gap-1 mt-1">
              <input value={sub[i.id]?.url || ''} onChange={(e) => setSub((s) => ({ ...s, [i.id]: { url: e.target.value } }))} placeholder="Outgoing URL for message.created" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
              <button onClick={() => subscribe(i.id)} className="text-xs px-2 py-1 rounded border border-gray-300">Subscribe</button>
              <button onClick={() => integrationsApi.remove(i.id).then(onChange).catch((err) => setError(err.message))} className="text-xs px-2 py-1 rounded border border-red-300 text-red-600">Delete</button>
            </div>
          </li>
        ))}
        {integrations.length === 0 ? <p className="text-xs text-gray-400">No integrations yet.</p> : null}
      </ul>
    </section>
  );
}
