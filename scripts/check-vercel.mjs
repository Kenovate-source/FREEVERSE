// Verifies that Vercel's own build tooling discovers the API function and the /api rewrite.
// Usage: node scripts/check-vercel.mjs   (needs network access to the npm registry once, to fetch the Vercel CLI)
// It copies the project to a temporary directory first, so the Vercel CLI can never touch your node_modules.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const tmp = mkdtempSync(join(tmpdir(), 'fv-vercel-')); const proj = join(tmp, 'p'); mkdirSync(proj);
const skip = new Set(['node_modules', 'dist', '.data', '.git', 'screenshots', '.vercel']);
cpSync('.', proj, { recursive: true, filter: (s) => !skip.has(s.split('/').pop()) });
mkdirSync(join(proj, '.vercel')); writeFileSync(join(proj, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_local', orgId: 'team_local', settings: { framework: null } }));
const cli = join(tmp, 'cli'); mkdirSync(cli); writeFileSync(join(cli, 'package.json'), '{"name":"c","private":true}');
execFileSync('npm', ['i', 'vercel', '--no-audit', '--no-fund'], { cwd: cli, stdio: 'ignore' });
const env = { ...process.env, VERCEL_ORG_ID: 'team_local', VERCEL_PROJECT_ID: 'prj_local' };
const out = execFileSync(join(cli, 'node_modules/.bin/vercel'), ['build', '--yes'], { cwd: proj, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const fnDir = join(proj, '.vercel/output/functions/api'); const funcs = existsSync(fnDir) ? readdirSync(fnDir) : [];
const cfg = JSON.parse(readFileSync(join(proj, '.vercel/output/config.json'), 'utf8'));
const routed = cfg.routes.some((r) => typeof r.dest === 'string' && r.dest.startsWith('/api/proxy'));
const ok = /Build completed successfully/.test(out) && funcs.includes('proxy.func') && routed && !/unused_function/.test(out);
console.log(`${ok ? 'PASS' : 'FAIL'}  vercel build; functions: ${funcs.join(', ') || 'none'}; /api rewrite routed: ${routed}`);
process.exit(ok ? 0 : 1);
