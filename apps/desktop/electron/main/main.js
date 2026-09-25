import { app, BrowserWindow, Tray, Menu, nativeImage, crashReporter, session, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { initLogger, mainLog } from './logger.js';
import { registerAuthIpc } from '../ipc/auth.ipc.js';
import { registerSystemIpc, initAutoUpdater } from '../ipc/system.ipc.js';
import { registerFileIpc } from '../ipc/file.ipc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTOCOL = 'teamchat';
const SMOKE = process.argv.includes('--smoke');

let win = null;
let tray = null;
let deepLinkUrl = null;
const log = initLogger(loadConfig().logLevel);
const appLog = mainLog();

// Crashpad → local dumps + JSON summaries POSTed by the renderer to /crashes.
crashReporter.start({ productName: 'TeamChat', companyName: 'TeamChat', submitURL: '', uploadToServer: false });

// Single instance (Slack-like): second launch focuses + forwards deep links.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) dispatchDeepLink(url);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [join(__dirname, 'main.js')]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

function apiOrigin() {
  try {
    return new URL(loadConfig().apiUrl).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

function applyCsp() {
  // Production lockdown (CSP audit, Phase 10): app shell + API/WS + blobs
  // for file previews. Dev keeps Vite HMR working.
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) return;
  const origin = apiOrigin();
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    `connect-src 'self' ${origin} ws: wss:`,
    "media-src 'self' blob:",
    "font-src 'self' data:",
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, done) => {
    done({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] },
    });
  });
}

function createWindow() {
  const cfg = loadConfig();
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'TeamChat',
    icon: join(__dirname, '../../assets/icon.png'),
    show: !cfg.launchMinimized,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (SMOKE) win.hide();
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_URL) {
    win.loadURL(process.env.VITE_DEV_URL || 'http://localhost:5173');
  } else {
    win.loadFile(join(__dirname, '../../dist/renderer/index.html'));
  }
  win.on('close', (e) => {
    // Slack-like: closing minimizes to tray instead of quitting.
    if (!app.quitting && tray && !SMOKE) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });
  if (deepLinkUrl) {
    const url = deepLinkUrl;
    deepLinkUrl = null;
    setTimeout(() => dispatchDeepLink(url), 1500);
  }
  return win;
}

function setBadge(count) {
  const n = Number(count) || 0;
  if (tray) tray.setToolTip(n > 0 ? `TeamChat (${n} unread)` : 'TeamChat');
  if (!win) return;
  if (process.platform === 'darwin') {
    try {
      app.dock?.setBadge(n > 0 ? String(n) : '');
    } catch {}
  }
  if (n > 0 && !win.isFocused()) win.flashFrame(true);
  else win.flashFrame(false);
}

function setupTray() {
  try {
    const iconPath = join(__dirname, '../../assets/icon.png');
    let img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) img = undefined;
    tray = new Tray(img || nativeImage.createEmpty());
    tray.setToolTip('TeamChat');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open TeamChat', click: () => win?.show() },
      { type: 'separator' },
      {
        label: 'Quit', click: () => {
          app.quitting = true;
          app.quit();
        },
      },
    ]));
    tray.on('click', () => (win?.isVisible() ? win.hide() : win?.show()));
  } catch (err) {
    appLog.warn('tray unavailable', err.message);
  }
}

function dispatchDeepLink(url) {
  // teamchat://dm/<id> | teamchat://channel/<id> | teamchat://join/<token>
  try {
    const rest = url.replace(`${PROTOCOL}://`, '');
    const [kind, ...tail] = rest.split('/');
    win?.webContents.send('teamchat:deep-link', { kind, value: decodeURIComponent(tail.join('/')), url });
  } catch (err) {
    appLog.warn('bad deep link', url, err.message);
  }
}

app.whenReady().then(async () => {
  applyCsp();
  registerAuthIpc(appLog);
  registerSystemIpc({ getWindow: () => win, setBadge });
  registerFileIpc();
  setupTray();
  createWindow();
  initAutoUpdater(appLog, (kind, info) => {
    win?.webContents.send('teamchat:update', { kind, version: info?.version || null });
  });
  //electron-updater periodic check is triggered from the renderer (updates:check)
  // so dev soaks never phone home unexpectedly.
  if (SMOKE) {
    // Packaged-app smoke: verify preload bridge, then exit with a code.
    const timeout = setTimeout(() => {
      appLog.error('smoke test timed out');
      process.exitCode = 2;
      app.quitting = true;
      app.quit();
    }, 30000);
    win.webContents.once('did-finish-load', async () => {
      try {
        const pong = await win.webContents.executeJavaScript('window.teamchat.system.ping()');
        const version = await win.webContents.executeJavaScript('window.teamchat.system.version()');
        clearTimeout(timeout);
        const ok = pong === 'pong' && version?.name === 'teamchat-desktop';
        appLog.info(`smoke ${ok ? 'PASS' : 'FAIL'}`, JSON.stringify(version));
        process.exitCode = ok ? 0 : 1;
      } catch (err) {
        clearTimeout(timeout);
        appLog.error('smoke FAIL', err.message);
        process.exitCode = 1;
      }
      app.quitting = true;
      app.quit();
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else win?.show();
  });
});

app.on('open-url', (e, url) => {
  e.preventDefault();
  if (win) dispatchDeepLink(url);
  else deepLinkUrl = url;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Forward renderer crashes to the log (full reports go to POST /crashes).
process.on('uncaughtException', (err) => appLog.error('main uncaught', err));
ipcMain.on('teamchat:renderer-crash', (_e, info) => appLog.error('renderer crash', info));
