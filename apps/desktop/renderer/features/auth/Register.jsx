import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../services/api.js';
import { useAuth } from '../../stores/auth.store.jsx';
import { AuthLayout, Field, PrimaryButton } from './AuthLayout.jsx';

export default function Register() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.register({ email, password, displayName });
      await login({ email, password });
      nav('/');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Join your team on TeamChat">
      <form onSubmit={submit}>
        <Field placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Field placeholder="Password (min 8 characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create account'}</PrimaryButton>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        Already have an account? <Link to="/login" className="text-[#1264A3] hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
