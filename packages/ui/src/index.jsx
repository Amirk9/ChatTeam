import React from 'react';

export function Button({ children, ...props }) {
  return <button {...props}>{children}</button>;
}

export function TextInput(props) {
  return <input {...props} />;
}

export function Avatar({ name }) {
  return <div aria-label={name}>{(name || '?').slice(0, 1)}</div>;
}
