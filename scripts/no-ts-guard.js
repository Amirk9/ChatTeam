// Fails the build if any TypeScript files are added (project is JS-only).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps', 'packages', 'scripts', 'tests'];
const offenders = [];

function walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === 'out') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (e.endsWith('.ts') || e.endsWith('.tsx') || e === 'tsconfig.json') offenders.push(p);
  }
}

for (const r of roots) walk(r);
if (offenders.length) {
  console.error('TypeScript is not allowed in this project (ReactJS/JS only):');
  for (const o of offenders) console.error(' - ' + o);
  process.exit(1);
}
console.log('no-ts-guard: clean (JS only)');
