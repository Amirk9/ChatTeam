import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../stores/workspace.store.jsx';
import { workspaceApi } from '../../services/workspaces.js';
import { Field, PrimaryButton } from '../auth/AuthLayout.jsx';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Slack-style workspace switcher in the sidebar header.
export function WorkspaceSwitcher() {
  const { workspaces, current, switchTo, refresh } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      const ws = await workspaceApi.create({ name });
      await refresh();
      await switchTo(ws.id);
      setMode(null);
      setName('');
    } catch (err) {
      setError(err.message || 'Could not create workspace');
    }
  }

  async function join(e) {
    e.preventDefault();
    setError('');
    try {
      const ws = await workspaceApi.join(code.trim());
      await refresh();
      await switchTo(ws.id);
      setMode(null);
      setCode('');
    } catch (err) {
      setError(err.message || 'Invalid invite code');
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left px-4 py-3 border-b border-white/10 hover:bg-white/5">
        <p className="font-bold truncate">{current ? current.name : 'No workspace'}</p>
        <p className="text-xs text-white/60">Switch workspaces ▾</p>
      </button>
      {open ? (
        <div className="absolute left-2 right-2 top-full mt-1 bg-white text-[#1d1c1d] rounded-lg shadow-xl border border-gray-200 py-2 z-40">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => { switchTo(w.id); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${w.id === current?.id ? 'font-bold' : ''}`}
            >
              {w.name}
              <span className="ml-2 text-xs text-gray-400">{w.role}</span>
            </button>
          ))}
          <div className="border-t border-gray-100 mt-2 pt-2 px-2 space-y-1">
            <button onClick={() => { setMode('create'); setOpen(false); setError(''); }} className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100">+ Create workspace</button>
            <button onClick={() => { setMode('join'); setOpen(false); setError(''); }} className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100">Join with invite code</button>
          </div>
        </div>
      ) : null}
      {mode === 'create' ? (
        <Modal title="Create a workspace" onClose={() => setMode(null)}>
          <form onSubmit={create}>
            {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
            <Field placeholder="Workspace name, e.g. Acme Corp" value={name} onChange={(e) => setName(e.target.value)} />
            <PrimaryButton type="submit">Create</PrimaryButton>
          </form>
        </Modal>
      ) : null}
      {mode === 'join' ? (
        <Modal title="Join a workspace" onClose={() => setMode(null)}>
          <form onSubmit={join}>
            {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
            <Field placeholder="Paste invite code" value={code} onChange={(e) => setCode(e.target.value)} />
            <PrimaryButton type="submit">Join</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

export function useWorkspaceNav() {
  const nav = useNavigate();
  return nav;
}
