import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/auth.store.jsx';
import { AuthLayout, styles } from './AuthLayout.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await login({ email, password });
      nav('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  }

  return (
    <AuthLayout title="Sign in to TeamChat" error={error}>
      <form onSubmit={submit}>
        <input style={styles.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={styles.input} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button style={styles.btn} type="submit">Sign in</button>
      </form>
      <p><Link to="/register">Create an account</Link> · <Link to="/forgot">Forgot password?</Link></p>
    </AuthLayout>
  );
}
