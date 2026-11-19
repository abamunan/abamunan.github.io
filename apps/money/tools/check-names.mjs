// Fails when any app JS file uses a name that is not defined or imported: the bug class behind the Search, "Add debt" and debt-Delete crashes
// (a ReferenceError only shows when someone taps the button). Uses TypeScript's checker on plain JS; nothing is compiled or changed.
//   npm install          (installs the typescript devDependency once)
//   npm run lint:names   exit 0 = clean, 1 = undefined names found, 2 = TypeScript missing / did not run
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tsc = process.env.TSC || join(root, 'node_modules', 'typescript', 'bin', 'tsc');       // TSC=/path/to/tsc overrides
if (!existsSync(tsc)) { console.error('TypeScript not found. Run `npm install` first (or set TSC=/path/to/typescript/bin/tsc).'); process.exit(2); }
const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.check.json'], { cwd: root, encoding: 'utf8' });
if (r.error || r.status === null) { console.error('tsc did not run', r.error || ''); process.exit(2); }
// 2304 / 2552 = cannot find name. TS1xxx = syntax error: tsc stops type-checking a file it cannot parse, so a syntax error must fail too (it would otherwise hide every undefined name).
const bad = (r.stdout || '').split('\n').filter(l => /error TS(2304|2552|1\d{3}):?/.test(l));
if (bad.length) { console.error(`Undefined names or syntax errors (${bad.length}):\n${bad.join('\n')}`); process.exit(1); }
console.log('no undefined names');
