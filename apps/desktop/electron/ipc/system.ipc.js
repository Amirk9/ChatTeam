import { app, ipcMain, shell } from 'electron';
import log from 'electron-log';
import updaterPkg from 'electron-updater';

const { autoUpdater } = updaterPkg;
import { loadConfig, saveConfig, configPath } from '../main/config.js';

// System surface: version, logs (tail/export/reveal), config, updates, badge.
// All validation happens here — the renderer never touches Node directly.
export function registerSystemIpc({ getWindow, setBadge }) {
  ipcMain.handle('system:ping', () => 'pong');
  ipcMain.handle('system:version', () => ({
    version: app.getVersion(),
    name: 'teamchat-desktop',
    platform: process.platform,
  }));

  ipcMain.handle('logs:tail', async (_e, { lines = 200 } = {}) => {
    try {
      const file = log.transports.file.getFile().path;
      const { readFileSync, existsSync } = await import('node:fs');
      if (!existsSync(file)) return { path: file, lines: [] };
      const all = readFileSync(file, 'utf8').split('\n');
      return { path: file, lines: all.slice(-Math.min(Number(lines) || 200, 2000)) };
    } catch (err) {
      return { path: '', lines: [], error: err.message };
    }
  });

  ipcMain.handle('logs:reveal', async () => {
    try {
      shell.showItemInFolder(log.transports.file.getFile().path);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('logs:write', async (_e, { level = 'info', message = '' } = {}) => {
    try {
      log[level]?.(String(message).slice(0, 2000));
    } catch {}
    return { ok: true };
  });

  ipcMain.handle('config:get', async () => ({ ...loadConfig(), configPath: configPath() }));
  ipcMain.handle('config:set', async (_e, patch = {}) => {
    const allowed = {};
    if (typeof patch.apiUrl === 'string' && patch.apiUrl.length < 200) allowed.apiUrl = patch.apiUrl.replace(/\/$/, '');
    if (typeof patch.launchMinimized === 'boolean') allowed.launchMinimized = patch.launchMinimized;
    if (typeof patch.logLevel === 'string') allowed.logLevel = patch.logLevel;
    return saveConfig(allowed);
  });

  ipcMain.handle('notifications:badge', async (_e, { count = 0 } = {}) => {
    setBadge?.(Number(count) || 0);
    return { ok: true };
  });

  ipcMain.handle('updates:check', async () => checkForUpdates());
}

export async function checkForUpdates() {
  const feedUrl = loadConfig().updateFeedUrl;
  if (!feedUrl || !app.isPackaged) {
    return { available: false, reason: !app.isPackaged ? 'dev-mode' : 'no-feed' };
  }
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    const result = await autoUpdater.checkForUpdates();
    return {
      available: !!result?.updateInfo,
      version: result?.updateInfo?.version || null,
      notes: result?.updateInfo?.releaseNotes || '',
    };
  } catch (err) {
    return { available: false, reason: String(err?.message || err).slice(0, 200) };
  }
}

export function initAutoUpdater(log, onEvent) {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.logger = log;
  autoUpdater.on('update-available', (info) => onEvent?.('available', info));
  autoUpdater.on('update-downloaded', (info) => onEvent?.('downloaded', info));
  autoUpdater.on('error', (err) => onEvent?.('error', err));
}
