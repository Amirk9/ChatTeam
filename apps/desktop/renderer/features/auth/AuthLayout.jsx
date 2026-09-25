import React from 'react';

const box = { maxWidth: 400, margin: '80px auto', fontFamily: 'system-ui', padding: 24, border: '1px solid #ddd', borderRadius: 8 };
const input = { display: 'block', width: '100%', margin: '8px 0', padding: 10, boxSizing: 'border-box' };
const btn = { width: '100%', padding: 10, marginTop: 8, cursor: 'pointer' };

export function AuthLayout({ title, children, error }) {
  return (
    <div style={box}>
      <h2>TeamChat</h2>
      <h3>{title}</h3>
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      {children}
    </div>
  );
}

export const styles = { input, btn };
