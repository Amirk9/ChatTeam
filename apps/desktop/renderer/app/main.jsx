import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from '../stores/auth.store.jsx';
import { WorkspaceProvider } from '../stores/workspace.store.jsx';
import { ChannelProvider } from '../stores/channel.store.jsx';
import { MessageProvider } from '../stores/message.store.jsx';
import { DMProvider } from '../stores/dm.store.jsx';
import { PresenceProvider } from '../stores/presence.store.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <WorkspaceProvider>
        <ChannelProvider>
          <MessageProvider>
            <DMProvider>
            <PresenceProvider>
              <App />
            </PresenceProvider>
            </DMProvider>
          </MessageProvider>
        </ChannelProvider>
      </WorkspaceProvider>
    </AuthProvider>
  </BrowserRouter>
);
