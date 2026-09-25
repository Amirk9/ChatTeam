import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth.store.jsx';
import { useWorkspace } from '../stores/workspace.store.jsx';
import Login from '../features/auth/Login.jsx';
import Register from '../features/auth/Register.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail } from '../features/auth/Password.jsx';
import { ChannelHeader, MembersDrawer } from '../features/channels/ChannelHeader.jsx';
import { useChannels } from '../stores/channel.store.jsx';
import { useMessages } from '../stores/message.store.jsx';
import { useCall } from '../stores/call.store.jsx';
import MessageFeed from '../features/messages/MessageFeed.jsx';
import Composer from '../features/messages/Composer.jsx';
import ThreadPane from '../features/messages/ThreadPane.jsx';
import Bell from '../features/notifications/Bell.jsx';
import SearchBar from '../features/search/SearchBar.jsx';
import CallBar from '../features/calls/CallBar.jsx';
import Rail from '../features/shell/Rail.jsx';
import SlackSidebar from '../features/shell/SlackSidebar.jsx';
import OfflineBanner from '../features/system/OfflineBanner.jsx';
import UpdateBanner from '../features/system/UpdateBanner.jsx';
import { usePresence } from '../stores/presence.store.jsx';
import { ThemeProvider } from '../stores/theme.store.jsx';
import { checkServerCompat, IN_APP } from '../services/api.js';
import { workspaceApi } from '../services/workspaces.js';
import { canvasApi } from '../services/canvas.js';

// Phase 10 perf: secondary routes split into lazy chunks (smaller boot bundle).
const SearchPage = lazy(() => import('../features/search/SearchPage.jsx'));
const DMPage = lazy(() => import('../features/direct-messages/DMPage.jsx'));
const Members = lazy(() => import('../features/workspace/Members.jsx'));
const Settings = lazy(() => import('../features/workspace/Settings.jsx'));
const Profile = lazy(() => import('../features/workspace/Profile.jsx'));
// Phase 11: advanced chunks stay lazy (calls/canvas/apps/workflows/admin).
const CanvasPage = lazy(() => import('../features/canvas/CanvasPage.jsx'));
const CanvasListPage = lazy(() => import('../features/canvas/CanvasPage.jsx').then((m) => ({ default: m.CanvasList })));
const AppsPage = lazy(() => import('../features/apps/AppsPage.jsx'));
const WorkflowsPage = lazy(() => import('../features/workflows/WorkflowsPage.jsx'));
const AdminPage = lazy(() => import('../features/admin/AdminPage.jsx'));

function RouteFallback() {
  return <p className="p-8 text-sm text-gray-500">Loading…</p>;
}

// teamchat:// deep links (dm/<id> | channel/<id> | join/<token>) from main.
function useDeepLinks() {
  const nav = useNavigate();
  const { switchTo } = useWorkspace();
  useEffect(() => {
    return window.teamchat?.deepLink?.on?.(({ kind, value }) => {
      if (!value) return;
      if (kind === 'dm') nav(`/dm/${value}`);
      else if (kind === 'channel') nav(`/?channel=${encodeURIComponent(value)}`);
      else if (kind === 'join') nav(`/?join=${encodeURIComponent(value)}`);
    });
  }, [nav, switchTo]);
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6 font-sans">Loading TeamChat...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Home() {
  const { current: workspace } = useWorkspace();
  const { current, refresh: refreshChannels } = useChannels();
  const { byChannel, openThread } = useMessages();
  const { join: joinCall } = useCall();
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [unreadSnap, setUnreadSnap] = useState(0);
  const [marked, setMarked] = useState(false);
  const [tab, setTab] = useState('messages');

  useEffect(() => {
    refreshChannels(workspace?.id);
  }, [workspace?.id]);

  useEffect(() => {
    setMarked(false);
    setUnreadSnap(current?.unreadCount || 0);
    setTab('messages');
  }, [current?.id]);

  useEffect(() => {
    if (marked || !current) return;
    const feed = byChannel[current.id];
    if (feed && feed.messages.length) {
      setMarked(true);
      const t = setTimeout(() => refreshChannels(workspace?.id), 2500);
      return () => clearTimeout(t);
    }
  }, [byChannel, current?.id, marked]);

  if (!workspace) {
    return (
      <div className="p-8 max-w-xl">
        <h2 className="text-xl font-bold mb-2 text-[#1d1c1d] dark:text-white">Welcome to TeamChat</h2>
        <p className="text-sm text-gray-500 dark:text-white/50 mb-4">Create a workspace or join one with an invite code using the switcher on the left.</p>
        <div className="flex gap-2">
          <button onClick={() => window.dispatchEvent(new CustomEvent('teamchat:workspace-modal'))}
            className="text-sm px-4 py-2 rounded bg-[#611f69] text-white">Create a workspace</button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('teamchat:workspace-modal'))}
            className="text-sm px-4 py-2 rounded border border-gray-300 dark:border-white/15 hover:bg-gray-50 dark:hover:bg-white/10">Join with invite code</button>
        </div>
      </div>
    );
  }

  if (!current) {
    return <p className="p-8 text-sm text-gray-500 dark:text-white/50">Loading channels...</p>;
  }

  const feed = byChannel[current.id];
  const msgs = feed?.messages || [];
  const unreadFrom = unreadSnap > 0 && msgs.length >= unreadSnap ? msgs[Math.max(0, msgs.length - unreadSnap)]?.createdAt : null;

  async function reply(rootId) {
    await openThread(current.id, rootId);
  }

  return (
    <div className="flex-1 flex min-h-0 min-w-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <ChannelHeader onMembers={() => setDrawer(true)} tab={tab} setTab={setTab} />
        <MessageFeed
          channel={current}
          onReply={reply}
          unreadFrom={unreadFrom}
          onGif={() => window.dispatchEvent(new CustomEvent('teamchat:composer-emoji'))}
          onHuddle={() => joinCall(workspace.id, { channelId: current.id }).catch(() => {})}
          onInvite={() => window.dispatchEvent(new CustomEvent('teamchat:channel-invite'))}
        />
        <CallBar />
        {current.isArchived ? (
          <p className="p-4 text-sm text-gray-500 dark:text-white/50 border-t border-gray-200 dark:border-white/10">This channel is archived and read-only.</p>
        ) : (
          <Composer
            channel={current}
            workspaceId={workspace.id}
            onSent={() => refreshChannels(workspace.id)}
            onHuddle={() => joinCall(workspace.id, { channelId: current.id }).catch(() => {})}
            onCanvas={async () => {
              try {
                const cv = await canvasApi.create(workspace.id, { title: `#${current.name} canvas`, channelId: current.id });
                nav(`/canvas/${cv.id}`);
              } catch {}
            }}
          />
        )}
      </div>
      <ThreadPane channel={current} workspaceId={workspace.id} />
      <MembersDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { current, switchTo, refresh } = useWorkspace();
  const { notifUnread } = usePresence();
  const nav = useNavigate();
  const [compat, setCompat] = useState(null);
  const [wsModal, setWsModal] = useState(false);
  const [help, setHelp] = useState(false);
  useDeepLinks();

  useEffect(() => {
    const fn = () => setWsModal(true);
    window.addEventListener('teamchat:workspace-modal', fn);
    return () => window.removeEventListener('teamchat:workspace-modal', fn);
  }, []);

  useEffect(() => {
    checkServerCompat().then(setCompat).catch(() => {});
  }, []);

  useEffect(() => {
    window.teamchat?.system?.setBadge?.(notifUnread || 0);
  }, [notifUnread]);

  async function signOut() {
    await logout();
    nav('/login');
  }

  return (
    <div className="h-screen flex flex-col font-sans text-[#1d1c1d] dark:text-white">
      <header className="h-11 shrink-0 bg-[#350d36] text-white flex items-center px-3 gap-2">
        <button onClick={() => nav(-1)} title="Back" className="p-1 rounded hover:bg-white/10 text-white/70">←</button>
        <button onClick={() => nav(1)} title="Forward" className="p-1 rounded hover:bg-white/10 text-white/70">→</button>
        <button onClick={() => nav('/search')} title="History" className="p-1 rounded hover:bg-white/10 text-white/70">🕐</button>
        <div className="flex-1 flex justify-center" data-slack-search>
          <SearchBar workspaceId={current?.id} workspaceName={current?.name} />
        </div>
        <button onClick={() => setHelp(true)} title="Help"
          className="w-7 h-7 rounded-full border border-white/40 text-white/80 text-sm flex items-center justify-center hover:bg-white/10">?</button>
        <div className="flex items-center gap-2">
          <Bell />
          <Link to="/profile" className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-xs font-bold" title={user.displayName}>
            {(user.displayName || '?').slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </header>
      <OfflineBanner />
      <UpdateBanner />
      {compat && compat.appSupported === false ? (
        <div className="shrink-0 bg-red-700 text-white text-xs px-4 py-1.5 text-center">
          This app (v{compat.appVersion}) is too old for this server (needs ≥ v{compat.minAppVersion}). Please update to keep chatting.
        </div>
      ) : null}

      <div className="flex-1 flex min-h-0">
        <Rail onAddWorkspace={() => setWsModal(true)} />
        <aside className="w-64 shrink-0 bg-[#3F0E40] text-white flex flex-col min-h-0">
          <SlackSidebar />
          <div className="p-3 border-t border-white/10 flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center font-bold">
              {(user.displayName || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.displayName}</p>
              <p className="text-xs text-white/60 truncate">{current ? `${current.name} · ${current.role}` : user.email}</p>
            </div>
            <button onClick={signOut} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Sign out</button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1A1D21] min-h-0">
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dm/:id" element={<DMPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/canvases" element={<CanvasListPage />} />
            <Route path="/canvas/:id" element={<CanvasPage />} />
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/workflows" element={<WorkflowsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/members" element={<Members />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
          </Suspense>
        </main>
      </div>
      {wsModal ? <WorkspaceModal onClose={() => setWsModal(false)} /> : null}
      {help ? <HelpModal onClose={() => setHelp(false)} /> : null}
    </div>
  );
}

function WorkspaceModal({ onClose }) {
  const { workspaces, current, switchTo, refresh } = useWorkspace();
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    try {
      const ws = await workspaceApi.create({ name });
      await refresh();
      await switchTo(ws.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  async function join(e) {
    e.preventDefault();
    try {
      const ws = await workspaceApi.join(code.trim());
      await refresh();
      await switchTo(ws.id);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1A1D21] dark:text-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Workspaces</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <ul className="mb-3 max-h-48 overflow-y-auto">
          {workspaces.map((w) => (
            <li key={w.id}>
              <button onClick={() => { switchTo(w.id); onClose(); }}
                className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-white/10 ${w.id === current?.id ? 'font-bold' : ''}`}>
                {w.name}<span className="ml-2 text-xs text-gray-400">{w.role}</span>
              </button>
            </li>
          ))}
        </ul>
        {!mode ? (
          <div className="flex gap-2">
            <button onClick={() => setMode('create')} className="flex-1 text-sm px-4 py-2 rounded bg-[#611f69] text-white">Create</button>
            <button onClick={() => setMode('join')} className="flex-1 text-sm px-4 py-2 rounded border border-gray-300 dark:border-white/15">Join</button>
          </div>
        ) : mode === 'create' ? (
          <form onSubmit={create} className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" className="flex-1 border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-3 py-2 text-sm outline-none" />
            <button className="text-sm px-4 py-2 rounded bg-[#611f69] text-white">Go</button>
          </form>
        ) : (
          <form onSubmit={join} className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" className="flex-1 border border-gray-300 dark:border-white/15 dark:bg-white/5 rounded-md px-3 py-2 text-sm outline-none" />
            <button className="text-sm px-4 py-2 rounded bg-[#611f69] text-white">Go</button>
          </form>
        )}
      </div>
    </div>
  );
}

function HelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#1A1D21] dark:text-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">Keyboard shortcuts</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>
        <ul className="text-sm space-y-1.5">
          <li><code className="bg-gray-100 dark:bg-white/10 rounded px-1">Ctrl+K</code> — search</li>
          <li><code className="bg-gray-100 dark:bg-white/10 rounded px-1">Enter</code> — send · <code className="bg-gray-100 dark:bg-white/10 rounded px-1">Shift+Enter</code> — new line</li>
          <li><code className="bg-gray-100 dark:bg-white/10 rounded px-1">/meeting</code>, <code className="bg-gray-100 dark:bg-white/10 rounded px-1">/poll</code>, <code className="bg-gray-100 dark:bg-white/10 rounded px-1">/github</code> — slash commands</li>
          <li><code className="bg-gray-100 dark:bg-white/10 rounded px-1">from:</code> <code className="bg-gray-100 dark:bg-white/10 rounded px-1">in:</code> <code className="bg-gray-100 dark:bg-white/10 rounded px-1">"phrase"</code> <code className="bg-gray-100 dark:bg-white/10 rounded px-1">has:file</code> — search filters</li>
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/*" element={<RequireAuth><Shell /></RequireAuth>} />
    </Routes>
    </ThemeProvider>
  );
}
