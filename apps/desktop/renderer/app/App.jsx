import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth.store.jsx';
import { useWorkspace } from '../stores/workspace.store.jsx';
import Login from '../features/auth/Login.jsx';
import Register from '../features/auth/Register.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail } from '../features/auth/Password.jsx';
import { WorkspaceSwitcher } from '../features/workspace/WorkspaceSwitcher.jsx';
import { ChannelList } from '../features/channels/ChannelList.jsx';
import { ChannelHeader, MembersDrawer } from '../features/channels/ChannelHeader.jsx';
import { useChannels } from '../stores/channel.store.jsx';
import { useMessages } from '../stores/message.store.jsx';
import MessageFeed from '../features/messages/MessageFeed.jsx';
import Composer from '../features/messages/Composer.jsx';
import ThreadPane from '../features/messages/ThreadPane.jsx';
import Bell from '../features/notifications/Bell.jsx';
import SearchBar from '../features/search/SearchBar.jsx';
import { DMList } from '../features/direct-messages/DMList.jsx';
import OfflineBanner from '../features/system/OfflineBanner.jsx';
import UpdateBanner from '../features/system/UpdateBanner.jsx';
import { usePresence } from '../stores/presence.store.jsx';
import { checkServerCompat, IN_APP } from '../services/api.js';

// Phase 10 perf: secondary routes split into lazy chunks (smaller boot bundle).
const SearchPage = lazy(() => import('../features/search/SearchPage.jsx'));
const DMPage = lazy(() => import('../features/direct-messages/DMPage.jsx'));
const Members = lazy(() => import('../features/workspace/Members.jsx'));
const Settings = lazy(() => import('../features/workspace/Settings.jsx'));
const Profile = lazy(() => import('../features/workspace/Profile.jsx'));

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

function SidebarItem({ to, children }) {
  const loc = useLocation();
  const active = loc.pathname === to;
  const cls = active ? 'bg-[#1164A3] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white';
  return (
    <li>
      <Link to={to} className={`block px-3 py-1 rounded-md text-[15px] truncate ${cls}`}>{children}</Link>
    </li>
  );
}

function Home() {
  const { current: workspace } = useWorkspace();
  const { current, refresh: refreshChannels } = useChannels();
  const { byChannel, openThread } = useMessages();
  const [drawer, setDrawer] = useState(false);
  const [unreadSnap, setUnreadSnap] = useState(0);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    refreshChannels(workspace?.id);
  }, [workspace?.id]);

  useEffect(() => {
    setMarked(false);
    setUnreadSnap(current?.unreadCount || 0);
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
        <h2 className="text-xl font-bold mb-2">Welcome to TeamChat</h2>
        <p className="text-sm text-gray-500">Create a workspace or join one with an invite code using the switcher on the left.</p>
      </div>
    );
  }

  if (!current) {
    return <p className="p-8 text-sm text-gray-500">Loading channels...</p>;
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
        <ChannelHeader onMembers={() => setDrawer(true)} />
        <MessageFeed channel={current} onReply={reply} unreadFrom={unreadFrom} />
        {current.isArchived ? (
          <p className="p-4 text-sm text-gray-500 border-t border-gray-200">This channel is archived and read-only.</p>
        ) : (
          <Composer channel={current} workspaceId={workspace.id} onSent={() => refreshChannels(workspace.id)} />
        )}
      </div>
      <ThreadPane channel={current} workspaceId={workspace.id} />
      <MembersDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { current } = useWorkspace();
  const { notifUnread } = usePresence();
  const nav = useNavigate();
  const [compat, setCompat] = useState(null);
  useDeepLinks();

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
    <div className="h-screen flex flex-col font-sans text-[#1d1c1d]">
      <header className="h-11 shrink-0 bg-[#350d36] text-white flex items-center px-4 gap-3">
        <span className="font-bold">TeamChat</span>
        <div className="flex-1 flex justify-center">
          <SearchBar workspaceId={current?.id} />
        </div>
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
        <aside className="w-60 shrink-0 bg-[#3F0E40] text-white flex flex-col min-h-0">
          <WorkspaceSwitcher />
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <ChannelList />
            <p className="px-3 pb-1 pt-3 text-xs font-semibold text-white/50 uppercase tracking-wide">Workspace</p>
            <ul className="space-y-0.5 mb-4">
              <SidebarItem to="/">Channels</SidebarItem>
              <SidebarItem to="/members">Members</SidebarItem>
              <SidebarItem to="/settings">Settings</SidebarItem>
              <SidebarItem to="/profile">Profile</SidebarItem>
            </ul>
            <p className="px-3 pb-1 text-xs font-semibold text-white/50 uppercase tracking-wide">Direct messages</p>
            <DMList />
          </nav>
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

        <main className="flex-1 flex flex-col min-w-0 bg-white min-h-0">
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dm/:id" element={<DMPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/members" element={<Members />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
          </Suspense>
        </main>

        <aside className="w-64 shrink-0 border-l border-gray-200 bg-gray-50 p-4 hidden lg:block">
          <h4 className="font-bold mb-1">{current ? current.name : 'TeamChat'}</h4>
          <p className="text-xs text-gray-500 mb-4">Channels arrive in Phase 4.</p>
          <p className="text-sm font-semibold">You</p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded bg-[#4A154B] text-white flex items-center justify-center text-xs font-bold">
              {(user.displayName || '?').slice(0, 1).toUpperCase()}
            </div>
            <span className="truncate">{user.displayName}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/*" element={<RequireAuth><Shell /></RequireAuth>} />
    </Routes>
  );
}
