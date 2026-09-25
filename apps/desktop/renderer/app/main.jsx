import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from '../stores/auth.store.jsx';
import { WorkspaceProvider } from '../stores/workspace.store.jsx';
import { ChannelProvider } from '../stores/channel.store.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <WorkspaceProvider>
        <ChannelProvider>
          <App />
        </ChannelProvider>
      </WorkspaceProvider>
    </AuthProvider>
  </BrowserRouter>
);
