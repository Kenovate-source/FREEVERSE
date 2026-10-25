// Repository structure guard. Runs at the start of every build (Vercel, Render, Docker) and in `npm run check:deploy`.
// Why it exists: files uploaded through a browser can arrive flattened into the repository root, or as "name (1).ext"
// copies. The app then builds from a mixture of old and new files and the Vercel proxy function is silently absent.
// This turns that into one clear build failure that says what is wrong and how to fix it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_FILES = [
  'package.json', 'package-lock.json', 'tsconfig.json', 'vercel.json', 'render.yaml',
  'api/proxy.mjs', 'api/_proxy.mjs', 'api/_proxy.d.mts', 'api/proxy.d.mts',
  'server/index.ts', 'server/app.ts', 'server/config.ts', 'server/db/migrate.ts',
  'src/main.tsx', 'src/app/App.tsx', 'src/pages/landing.tsx', 'src/immersive/index.ts', 'src/motion/mode.ts',
  'shared/constants.ts', 'shared/universes.ts', 'shared/universe-theme.ts', 'shared/api/settings.ts',
  'scripts/build.mjs', 'scripts/render-migrations.mjs', 'public/index.html',
];
/** Files that may sit at the repository root. Anything else with a source/asset extension is a flattened stray. */
const ROOT_ALLOWED = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'vercel.json', 'render.yaml', 'Dockerfile', 'README.md', 'LICENSE', 'LICENSE.md']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vercel', '.data', 'screenshots']);

function walk(root, dir = '', out = []) {
  for (const name of readdirSync(join(root, dir))) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(root, rel)).isDirectory()) walk(root, rel, out); else out.push(rel);
  }
  return out;
}

/** Returns a list of problems (empty when the structure is sound). */
export function checkStructure(root = process.cwd()) {
  const problems = [];
  for (const f of REQUIRED_FILES) if (!existsSync(join(root, f))) problems.push(`missing file: ${f}`);

  // vercel.json: every rewrite that targets /api/<name> needs a matching function file in api/.
  try {
    const v = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    for (const r of v.rewrites ?? []) {
      const m = /^\/api\/([A-Za-z0-9_-]+)$/.exec(r.destination ?? '');
      if (m && !['mjs', 'js', 'ts', 'cjs'].some((e) => existsSync(join(root, 'api', `${m[1]}.${e}`)))) problems.push(`vercel.json rewrites ${r.source} to ${r.destination}, but api/${m[1]}.mjs does not exist: Vercel would return the frontend or a 404 instead of the API`);
    }
    if (v.functions) for (const k of Object.keys(v.functions)) if (/[[\]*]/.test(k)) problems.push(`vercel.json functions key "${k}" is a glob; bracketed file names do not match (see docs/VERCEL_FIX.md)`);
  } catch (e) { problems.push(`vercel.json unreadable: ${e.message}`); }

  // The proxy's relative imports must resolve next to it.
  for (const f of ['api/proxy.mjs']) {
    if (!existsSync(join(root, f))) continue;
    for (const m of readFileSync(join(root, f), 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)) if (!existsSync(join(root, 'api', m[1]))) problems.push(`${f} imports ${m[1]}, which is not in api/`);
  }

  // Rendered migrations must exist for every template.
  const tplDir = join(root, 'migrations/src');
  if (existsSync(tplDir)) for (const t of readdirSync(tplDir).filter((x) => x.endsWith('.sql.tpl'))) for (const d of ['postgres', 'sqlite']) { const out = `migrations/${d}/${t.replace(/\.tpl$/, '')}`; if (!existsSync(join(root, out))) problems.push(`missing migration: ${out}`); }

  // Flattened uploads and browser-renamed duplicates.
  for (const f of readdirSync(root)) {
    if (f.startsWith('.') || statSync(join(root, f)).isDirectory() || ROOT_ALLOWED.has(f)) continue;
    problems.push(`stray file in the repository root (probably a flattened upload): ${f}`);
  }
  for (const f of walk(root)) if (/ \(\d+\)(\.[^/]*)?$/.test(f)) problems.push(`browser-renamed duplicate: ${f}`);
  return problems;
}

export function assertStructure(root = process.cwd()) {
  const problems = checkStructure(root);
  if (!problems.length) return;
  const shown = problems.slice(0, 25).map((p) => `  - ${p}`).join('\n');
  throw new Error(`Repository structure is wrong (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${shown}${problems.length > 25 ? `\n  ...and ${problems.length - 25} more` : ''}\n\nThis usually means files were uploaded without their folders. Re-publish the project with git (or GitHub Desktop) so folder paths are preserved. Steps: docs/REPO_REPAIR.md`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = checkStructure();
  if (p.length) { try { assertStructure(); } catch (e) { console.error(e.message); } process.exit(1); }
  console.log(`structure OK (${REQUIRED_FILES.length} required files present, no stray or duplicate files)`);
}
