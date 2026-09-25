import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../services/api.js';
import { AuthLayout, styles } from './AuthLayout.jsx';

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
    <AuthLayout title="Reset your password" error={error}>
      {done ? (
        <p>If that email exists, a reset link was sent. (Dev: check the server logs for the token.)</p>
      ) : (
        <form onSubmit={submit}>
          <input style={styles.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button style={styles.btn} type="submit">Send reset link</button>
        </form>
      )}
      <p><Link to="/login">Back to sign in</Link></p>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const [token] = useState(params.get('token') || '');
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
        <p>Password updated. <Link to="/login">Sign in</Link></p>
      ) : (
        <form onSubmit={submit}>
          <input style={styles.input} placeholder="Reset token" value={token} readOnly={Boolean(params.get('token'))} onChange={() => {}} />
          <input style={styles.input} placeholder="New password (min 8 chars)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={styles.btn} type="submit">Reset password</button>
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
      {state === 'pending' && <p>Verifying...</p>}
      {state === 'ok' && <p>Email verified. <Link to="/login">Sign in</Link></p>}
      {state === 'missing' && <p>No token in this link.</p>}
    </AuthLayout>
  );
}
