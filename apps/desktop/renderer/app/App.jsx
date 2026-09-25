import React, { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState('checking…');
  useEffect(() => {
    fetch('http://localhost:3000/version')
      .then((r) => r.json())
      .then((b) => setHealth(`server: ${b.name}@${b.version}`))
      .catch(() => setHealth('server: unreachable (start @teamchat/server)'));
  }, []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 260px', height: '100vh', fontFamily: 'system-ui' }}>
      <aside style={{ borderRight: '1px solid #ddd', padding: 12 }}>
        <h3>TeamChat (Phase 1 stub)</h3>
        <p>Workspace</p>
        <ul>
          <li># general</li>
          <li># dev (stub)</li>
        </ul>
        <p>DMs</p>
        <ul>
          <li>Amir (stub)</li>
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
        <p>Members: —</p>
      </aside>
    </div>
  );
}
