import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../services/api.js';
import { AuthLayout, Field, PrimaryButton } from './AuthLayout.jsx';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await authApi.forgot(email);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Request failed');
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We will email you a reset link" error={error}>
      {done ? (
        <div className="rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">
          If that email exists, a reset link was sent. (Dev: check the server logs for the token.)
        </div>
      ) : (
        <form onSubmit={submit}>
          <Field placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <PrimaryButton type="submit">Send reset link</PrimaryButton>
        </form>
      )}
      <p className="mt-4 text-sm"><Link to="/login" className="text-[#1264A3] hover:underline">Back to sign in</Link></p>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get('token') || '';
  const [token, setToken] = useState(preset);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await authApi.reset(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Reset failed');
    }
  }

  return (
    <AuthLayout title="Choose a new password" error={error}>
      {done ? (
        <p className="text-sm">Password updated. <Link to="/login" className="text-[#1264A3] hover:underline">Sign in</Link></p>
      ) : (
        <form onSubmit={submit}>
          <Field placeholder="Reset token" value={token} readOnly={Boolean(preset)} onChange={(e) => setToken(e.target.value)} />
          <Field placeholder="New password (min 8 characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <PrimaryButton type="submit">Reset password</PrimaryButton>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmail() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const [state, setState] = useState('pending');

  React.useEffect(() => {
    if (!token) {
      setState('missing');
      return;
    }
    authApi.verifyEmail(token).then(() => setState('ok')).catch(() => setState('bad'));
  }, [token]);

  return (
    <AuthLayout title="Email verification" error={state === 'bad' ? 'Invalid or expired link.' : ''}>
      {state === 'pending' && <p className="text-sm text-gray-500">Verifying...</p>}
      {state === 'ok' && <p className="text-sm">Email verified. <Link to="/login" className="text-[#1264A3] hover:underline">Sign in</Link></p>}
      {state === 'missing' && <p className="text-sm text-gray-500">No token in this link.</p>}
    </AuthLayout>
  );
}
