import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [health, setHealth] = useState('checking…');
  useEffect(() => {
    fetch('http://localhost:3000/version')
      .then((r) => r.json())
      .then((b) => setHealth(`${b.name}@${b.version}`))
      .catch(() => setHealth('unreachable'));
  }, []);
  return <div style={{ fontFamily: 'system-ui', padding: 24 }}>TeamChat web stub (Phase 1) — {health}</div>;
}

createRoot(document.getElementById('root')).render(<App />);
