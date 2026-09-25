import { app, ipcMain, safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Refresh-token vault (Phase 10): safeStorage/keychain when available,
// obfuscated local fallback otherwise (logged loudly so packaging knows).
// Access tokens stay in renderer memory only; refresh rotates via /auth/refresh.
const FILE = () => join(app.getPath('userData'), 'refresh.vault');

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function readVault() {
  try {
    if (!existsSync(FILE())) return null;
    const raw = readFileSync(FILE());
    if (canEncrypt()) return safeStorage.decryptString(raw);
    return Buffer.from(raw.toString(), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

export function registerAuthIpc(log) {
  ipcMain.handle('auth:login', async (_e, { refresh } = {}) => {
    if (!refresh) throw new Error('refresh required');
    try {
      const payload = canEncrypt()
        ? safeStorage.encryptString(String(refresh))
        : Buffer.from(String(refresh), 'utf8').toString('base64');
      writeFileSync(FILE(), payload);
      if (!canEncrypt()) log?.warn('safeStorage unavailable — refresh token stored obfuscated, not encrypted');
      return { ok: true, secure: canEncrypt() };
    } catch (err) {
      log?.error('auth vault write failed', err);
      throw new Error('could not persist session');
    }
  });

  ipcMain.handle('auth:getSession', async () => {
    const refresh = readVault();
    return refresh ? { refresh, secure: canEncrypt() } : null;
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      writeFileSync(FILE(), '');
    } catch {}
    return { ok: true };
  });
}
