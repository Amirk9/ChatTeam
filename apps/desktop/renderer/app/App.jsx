import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth.store.jsx';
import Login from '../features/auth/Login.jsx';
import Register from '../features/auth/Register.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail } from '../features/auth/Password.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6 font-sans">Loading TeamChat...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function SidebarItem({ active, children }) {
  return (
    <li
      className={`px-3 py-1 rounded-md text-[15px] cursor-pointer truncate ${
        active ? 'bg-[#1164A3] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </li>
  );
}

function Workspace() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [health, setHealth] = useState('checking...');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/version`)
      .then((r) => r.json())
      .then((b) => setHealth(`${b.name} ${b.version}`))
      .catch(() => setHealth('unreachable'));
  }, []);

  async function signOut() {
    await logout();
    nav('/login');
  }

  return (
    <div className="h-screen flex flex-col font-sans text-[#1d1c1d]">
      {/* Top bar */}
      <header className="h-11 shrink-0 bg-[#350d36] text-white flex items-center px-4 gap-3">
        <span className="font-bold">TeamChat</span>
        <div className="flex-1 flex justify-center">
          <div className="w-full max-w-xl bg-white/10 hover:bg-white/20 rounded-md text-sm px-3 py-1 text-white/70 cursor-pointer">
            Search messages, channels, people
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" title={health} />
          <span className="text-xs text-white/70 hidden md:inline">{health}</span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <aside className="w-60 shrink-0 bg-[#3F0E40] text-white flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="font-bold truncate">My Workspace</p>
            <p className="text-xs text-white/60 truncate">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />
              {user.displayName}
              {user.emailVerified ? '' : ' · unverified'}
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <p className="px-3 pb-1 text-xs font-semibold text-white/50 uppercase tracking-wide">Channels</p>
            <ul className="space-y-0.5 mb-4">
              <SidebarItem active># general</SidebarItem>
              <SidebarItem># dev <span className="text-white/40 text-xs">(Phase 4)</span></SidebarItem>
            </ul>
            <p className="px-3 pb-1 text-xs font-semibold text-white/50 uppercase tracking-wide">Direct messages</p>
            <ul className="space-y-0.5">
              <SidebarItem>Amir <span className="text-white/40 text-xs">(Phase 9)</span></SidebarItem>
            </ul>
          </nav>
          <div className="p-3 border-t border-white/10 flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center font-bold">
              {(user.displayName || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.displayName}</p>
              <p className="text-xs text-white/60 truncate">{user.email}</p>
            </div>
            <button onClick={signOut} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">
              Sign out
            </button>
          </div>
        </aside>

        {/* Center channel view */}
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="px-5 py-3 border-b border-gray-200">
            <h2 className="font-bold text-lg"># general</h2>
            <p className="text-xs text-gray-500">Company-wide announcements and chat · 1 member</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="max-w-2xl">
              <div className="w-14 h-14 rounded-lg bg-[#4A154B] text-white flex items-center justify-center text-2xl font-bold mb-3">#</div>
              <h3 className="text-xl font-bold mb-1">This is the very beginning of #general</h3>
              <p className="text-sm text-gray-500 mb-4">Messaging arrives in Phase 5, realtime in Phase 6.</p>
              <p className="text-xs text-gray-400">
                API: {health} · Preload bridge: {window.teamchat ? window.teamchat.version : 'browser mode'}
              </p>
            </div>
          </div>
          <div className="p-4">
            <div className="border border-gray-300 rounded-lg">
              <div className="px-4 py-3 text-sm text-gray-400">Message #general (Phase 5)</div>
              <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 text-gray-400 text-sm">
                <span className="cursor-pointer hover:text-gray-600">😊</span>
                <span className="cursor-pointer hover:text-gray-600">📎</span>
                <span className="cursor-pointer hover:text-gray-600">@</span>
              </div>
            </div>
          </div>
        </main>

        {/* Right info panel */}
        <aside className="w-64 shrink-0 border-l border-gray-200 bg-gray-50 p-4 hidden lg:block">
          <h4 className="font-bold mb-1"># general</h4>
          <p className="text-xs text-gray-500 mb-4">Channel information (Phase 4 expands this)</p>
          <p className="text-sm font-semibold">Members · 1</p>
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
      <Route path="/" element={<RequireAuth><Workspace /></RequireAuth>} />
    </Routes>
  );
}
