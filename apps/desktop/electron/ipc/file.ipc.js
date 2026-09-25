import { dialog, ipcMain } from 'electron';
import { readFile, writeFile, stat } from 'node:fs/promises';

// Native file dialogs for attachments (plan 07). Browser/Docker builds fall
// back to <input type="file"> + blob download (see features/files).
export function registerFileIpc() {
  ipcMain.handle('files:open', async (_e, { multi } = {}) => {
    const res = await dialog.showOpenDialog({
      properties: [...(multi === false ? [] : ['multiSelections']), 'openFile'],
      filters: [{ name: 'All files', extensions: ['*'] }],
    });
    if (res.canceled) return [];
    const out = [];
    for (const p of res.filePaths.slice(0, 5)) {
      const st = await stat(p);
      if (st.size > 50 * 1024 * 1024) continue;
      const data = await readFile(p);
      out.push({ path: p, name: p.split(/[\\/]/).pop(), size: st.size, base64: data.toString('base64') });
    }
    return out;
  });

  ipcMain.handle('files:save', async (_e, { filename } = {}) => {
    const res = await dialog.showSaveDialog({ defaultPath: filename || 'download' });
    return res.canceled ? null : res.filePath;
  });

  ipcMain.handle('files:write', async (_e, { filePath, base64 } = {}) => {
    if (!filePath || !base64) throw new Error('filePath + base64 required');
    await writeFile(filePath, Buffer.from(base64, 'base64'));
    return { ok: true };
  });
}
