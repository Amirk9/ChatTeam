import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Plain-JSON config in %APPDATA%/TeamChat (userData). Zero-dep alternative
// to electron-store: apiUrl override (packaged apps), log level, launch prefs.
const FILE = () => join(app.getPath('userData'), 'config.json');

const DEFAULTS = {
  apiUrl: process.env.VITE_API_URL || 'http://localhost:3000',
  logLevel: 'info',
  launchMinimized: false,
  updateFeedUrl: process.env.APP_UPDATE_FEED || '',
};

let cache = null;

export function loadConfig() {
  if (cache) return cache;
  try {
    if (existsSync(FILE())) {
      cache = { ...DEFAULTS, ...JSON.parse(readFileSync(FILE(), 'utf8')) };
    } else {
      cache = { ...DEFAULTS };
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(FILE(), JSON.stringify(next, null, 2));
  } catch {}
  cache = next;
  return next;
}

export function configPath() {
  return FILE();
}
