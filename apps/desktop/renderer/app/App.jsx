import React, { useEffect, useState } from 'react';
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
import Members from '../features/workspace/Members.jsx';
import Settings from '../features/workspace/Settings.jsx';
import Profile from '../features/workspace/Profile.jsx';

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
  const { current, refresh } = useChannels();
  const [health, setHealth] = useState('checking...');
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    refresh(workspace?.id);
  }, [workspace?.id]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/version`)
      .then((r) => r.json())
      .then((b) => setHealth(`${b.name} ${b.version}`))
      .catch(() => setHealth('unreachable'));
  }, []);

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

  return (
    <>
      <ChannelHeader onMembers={() => setDrawer(true)} />
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="max-w-2xl">
          <div className="w-14 h-14 rounded-lg bg-[#4A154B] text-white flex items-center justify-center text-2xl font-bold mb-3">
            {current.isPrivate ? '🔒' : '#'}
          </div>
          <h3 className="text-xl font-bold mb-1">Welcome to #{current.name}</h3>
          <p className="text-sm text-gray-500 mb-4">{current.description || 'This is the very beginning of the channel.'}</p>
          <p className="text-xs text-gray-400">API: {health} · Preload bridge: {window.teamchat ? window.teamchat.version : 'browser mode'}</p>
        </div>
      </div>
      <div className="p-4">
        <div className="border border-gray-300 rounded-lg">
          <div className="px-4 py-3 text-sm text-gray-400">Message #{current.name} (Phase 5)</div>
          <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 text-gray-400 text-sm">
            <span className="cursor-pointer hover:text-gray-600">😊</span>
            <span className="cursor-pointer hover:text-gray-600">📎</span>
            <span className="cursor-pointer hover:text-gray-600">@</span>
          </div>
        </div>
      </div>
      <MembersDrawer open={drawer} onClose={() => setDrawer(false)} />
    </>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { current } = useWorkspace();
  const nav = useNavigate();

  async function signOut() {
    await logout();
    nav('/login');
  }

  return (
    <div className="h-screen flex flex-col font-sans text-[#1d1c1d]">
      <header className="h-11 shrink-0 bg-[#350d36] text-white flex items-center px-4 gap-3">
        <span className="font-bold">TeamChat</span>
        <div className="flex-1 flex justify-center">
          <div className="w-full max-w-xl bg-white/10 hover:bg-white/20 rounded-md text-sm px-3 py-1 text-white/70 cursor-pointer">
            Search (Phase 8)
          </div>
        </div>
        <Link to="/profile" className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-xs font-bold" title={user.displayName}>
          {(user.displayName || '?').slice(0, 1).toUpperCase()}
        </Link>
      </header>

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
            <ul className="space-y-0.5">
              <li className="px-3 py-1 text-[15px] text-white/40">Coming in Phase 9</li>
            </ul>
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
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/members" element={<Members />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
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
