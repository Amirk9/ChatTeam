import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth.store.jsx';
import { AuthLayout, Field, PrimaryButton } from './AuthLayout.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login({ email, password });
      nav('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Sign in to TeamChat" subtitle="Enter your email and password to continue">
      <form onSubmit={submit}>
        <Field placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</PrimaryButton>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link to="/register" className="text-[#1264A3] hover:underline">Create an account</Link>
        <Link to="/forgot" className="text-[#1264A3] hover:underline">Forgot password?</Link>
      </div>
    </AuthLayout>
  );
}
