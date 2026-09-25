// Packaged-app smoke test (Phase 10): boots the built renderer in Electron,
// verifies the preload bridge, exits 0/1. Used by CI (xvfb on linux) and
// locally: pnpm --filter @teamchat/desktop electron:smoke
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const appDir = join(dir, '..');
const electronBin = join(appDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

const child = spawn(electronBin, [join(appDir, 'electron', 'main', 'main.js'), '--smoke'], {
  cwd: appDir,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
});
const kill = setTimeout(() => {
  console.error('smoke: timed out after 60s');
  child.kill('SIGKILL');
  process.exitCode = 2;
}, 60000);
child.on('exit', (code) => {
  clearTimeout(kill);
  console.log(`smoke: electron exited with code ${code}`);
  process.exitCode = code === 0 ? 0 : 1;
});
child.on('error', (err) => {
  clearTimeout(kill);
  console.error('smoke: failed to launch electron:', err.message);
  process.exitCode = 1;
});
