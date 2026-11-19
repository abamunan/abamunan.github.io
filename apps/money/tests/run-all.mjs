// Runs every Money test in one go. From the repo root:   node apps/money/tests/run-all.mjs
//   1. unit tests (run.mjs) and the cloud-sync test (sync-overwrite.mjs): need only Node
//   2. the undefined-name / syntax check (tools/check-names.mjs): needs `npm install` once (TypeScript), or TSC=/path/to/tsc
//   3. every browser-*.py (real Chromium via Playwright): need Python + `pip install playwright` + `playwright install chromium`
// If TypeScript, Python or Playwright is missing, that part is skipped with a clear message and the exit code is 2 (not a silent pass).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url)), root = join(dir, '..', '..', '..'), PORT = 8123;
const results = [];
const run = (name, cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' }); const out = (r.stdout || '') + (r.stderr || ''); const ok = r.status === 0;
  results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) console.log(out.split('\n').filter(l => /FAIL|Error|failed|assert/i.test(l)).slice(0, 8).map(l => '      ' + l).join('\n')); };

run('unit tests (run.mjs)', process.execPath, ['apps/money/tests/run.mjs']);
run('cloud sync (sync-overwrite.mjs)', process.execPath, ['apps/money/tests/sync-overwrite.mjs']);

const skips = [];
const names = spawnSync(process.execPath, ['apps/money/tools/check-names.mjs'], { cwd: root, encoding: 'utf8' });
if (names.status === 2) { skips.push('undefined-name check'); console.log('SKIP  undefined names (check-names.mjs): ' + ((names.stderr || '').trim().split('\n')[0] || 'TypeScript not available')); }
else run('undefined names + syntax (check-names.mjs)', process.execPath, ['apps/money/tools/check-names.mjs']);

const py = ['python3', 'python', 'py'].find(c => spawnSync(c, ['-c', 'import playwright'], { stdio: 'ignore' }).status === 0);
if (!py) { skips.push('browser tests'); console.log('SKIP  browser tests: Python with Playwright not found (pip install playwright && playwright install chromium)'); }
else {
  const server = spawn(py, ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  try { for (const f of readdirSync(dir).filter(f => /^browser-.*\.py$/.test(f)).sort()) run(`browser: ${f}`, py, ['-I', join('apps', 'money', 'tests', f)]); }
  finally { server.kill(); }
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${skips.length ? `, skipped: ${skips.join(', ')}` : ''}${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : skips.length ? 2 : 0);
