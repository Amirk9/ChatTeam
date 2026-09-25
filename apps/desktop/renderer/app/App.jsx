import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth.store.jsx';
import Login from '../features/auth/Login.jsx';
import Register from '../features/auth/Register.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail } from '../features/auth/Password.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: 24 }}>Loading TeamChat...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Workspace() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [health, setHealth] = useState('checking...');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/version`)
      .then((r) => r.json())
      .then((b) => setHealth(`server: ${b.name}@${b.version}`))
      .catch(() => setHealth('server: unreachable'));
  }, []);

  async function signOut() {
    await logout();
    nav('/login');
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 260px', height: '100vh', fontFamily: 'system-ui' }}>
      <aside style={{ borderRight: '1px solid #ddd', padding: 12 }}>
        <h3>TeamChat</h3>
        <p>Signed in as <strong>{user.displayName}</strong><br /><small>{user.email}{user.emailVerified ? ' (verified)' : ' (unverified)'}</small></p>
        <button onClick={signOut}>Sign out</button>
        <p>Workspace</p>
        <ul>
          <li># general</li>
          <li># dev (Phase 4)</li>
        </ul>
        <p>DMs</p>
        <ul>
          <li>Amir (Phase 9)</li>
        </ul>
      </aside>
      <main style={{ padding: 12 }}>
        <h2># general</h2>
        <p>Messaging lands in Phase 5. Realtime in Phase 6.</p>
        <p>{health}</p>
        <p>Preload bridge: {window.teamchat ? window.teamchat.version : 'no preload (browser mode)'}</p>
      </main>
      <aside style={{ borderLeft: '1px solid #ddd', padding: 12 }}>
        <h4>Channel info (stub)</h4>
        <p>Members: -</p>
      </aside>
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
