import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from '../stores/auth.store.jsx';
import { WorkspaceProvider } from '../stores/workspace.store.jsx';
import { ChannelProvider } from '../stores/channel.store.jsx';
import { MessageProvider } from '../stores/message.store.jsx';
import { DMProvider } from '../stores/dm.store.jsx';
import { CallProvider } from '../stores/call.store.jsx';
import { PresenceProvider } from '../stores/presence.store.jsx';
import './index.css';

// Phase 10: forward renderer crashes to the main log + POST /crashes.
if (typeof window !== 'undefined') {
  const report = (error, stack) => {
    try {
      window.teamchat?.system?.logsWrite?.('error', `renderer: ${String(error).slice(0, 500)}`);
    } catch {}
    try {
      const base = localStorage.getItem('tc_api_url') || import.meta.env.VITE_API_URL || 'http://localhost:3000';
      fetch(`${base}/crashes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: String(error).slice(0, 2000), stack: String(stack || '').slice(0, 5000), platform: navigator.platform, context: { url: location.href } }),
      }).catch(() => {});
    } catch {}
  };
  window.addEventListener('error', (e) => report(e.message, e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => report(e.reason?.message || e.reason, e.reason?.stack));
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <WorkspaceProvider>
        <ChannelProvider>
          <MessageProvider>
            <DMProvider>
            <CallProvider>
            <PresenceProvider>
              <App />
            </PresenceProvider>
            </CallProvider>
            </DMProvider>
          </MessageProvider>
        </ChannelProvider>
      </WorkspaceProvider>
    </AuthProvider>
  </BrowserRouter>
);
