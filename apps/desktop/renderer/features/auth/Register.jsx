import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../services/api.js';
import { useAuth } from '../../stores/auth.store.jsx';
import { AuthLayout, styles } from './AuthLayout.jsx';

export default function Register() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await authApi.register({ email, password, displayName });
      await login({ email, password });
      nav('/');
    } catch (err) {
      setError(err.message || 'Registration failed');
    }
  }

  return (
    <AuthLayout title="Create your account" error={error}>
      <form onSubmit={submit}>
        <input style={styles.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={styles.input} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input style={styles.input} placeholder="Password (min 8 chars)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button style={styles.btn} type="submit">Create account</button>
      </form>
      <p><Link to="/login">Back to sign in</Link></p>
    </AuthLayout>
  );
}
