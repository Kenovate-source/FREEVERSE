// The repository-structure guard: the real tree passes, and each way an upload can go wrong is caught with a clear message.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, renameSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkStructure, assertStructure, REQUIRED_FILES } from '../scripts/check-structure.mjs';

const ROOT = process.cwd();
const COPY = ['api', 'server', 'src', 'shared', 'scripts', 'public', 'migrations', 'package.json', 'package-lock.json', 'tsconfig.json', 'vercel.json', 'render.yaml'];
function fixture() { const d = mkdtempSync(join(tmpdir(), 'fv-struct-')); for (const f of COPY) cpSync(join(ROOT, f), join(d, f), { recursive: true }); return d; }

describe('repository structure guard', () => {
  test('the real repository is sound', () => { assert.deepEqual(checkStructure(ROOT) as string[], []); });
  test('the proxy function and its dependency are required', () => { for (const f of ['api/proxy.mjs', 'api/_proxy.mjs']) assert.ok((REQUIRED_FILES as string[]).includes(f), f); });
  test('missing api/ (the live failure) is reported, including the dead rewrite', () => {
    const d = fixture(); try { rmSync(join(d, 'api'), { recursive: true });
      const p = checkStructure(d) as string[]; assert.ok(p.some((x) => x.includes('missing file: api/proxy.mjs'))); assert.ok(p.some((x) => x.includes('rewrites') && x.includes('/api/proxy')), p.join('\n'));
      assert.throws(() => assertStructure(d), /uploaded without their folders/);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test('a flattened upload (proxy files in the root instead of api/) is caught', () => {
    const d = fixture(); try { renameSync(join(d, 'api/proxy.mjs'), join(d, 'proxy.mjs')); renameSync(join(d, 'api/_proxy.mjs'), join(d, '_proxy.mjs'));
      const p = checkStructure(d) as string[]; assert.ok(p.some((x) => x.includes('stray file in the repository root') && x.includes('proxy.mjs')), p.join('\n')); assert.ok(p.some((x) => x.includes('missing file: api/proxy.mjs')));
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test('browser-renamed duplicates such as "name (1).sql" are caught anywhere in the tree', () => {
    const d = fixture(); try { writeFileSync(join(d, 'migrations/sqlite/0001_identity_social (1).sql'), 'x'); const p = checkStructure(d) as string[]; assert.ok(p.some((x) => x.includes('browser-renamed duplicate')), p.join('\n')); } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test('a missing rendered migration is caught', () => {
    const d = fixture(); try { rmSync(join(d, 'migrations/postgres/0004_governance_detail_legal_anon.sql')); const p = checkStructure(d) as string[]; assert.ok(p.some((x) => x.includes('missing migration: migrations/postgres/0004')), p.join('\n')); } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test('a proxy that imports something not beside it is caught', () => {
    const d = fixture(); try { rmSync(join(d, 'api/_proxy.mjs')); mkdirSync(join(d, 'lib'), { recursive: true }); writeFileSync(join(d, 'lib/_proxy.mjs'), ''); const p = checkStructure(d) as string[]; assert.ok(p.some((x) => x.includes('imports ./_proxy.mjs')), p.join('\n')); } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test('a bracketed functions key in vercel.json is caught', () => {
    const d = fixture(); try { const v = JSON.parse(readFileSync(join(d, 'vercel.json'), 'utf8')); v.functions = { 'api/[...path].mjs': { maxDuration: 30 } }; writeFileSync(join(d, 'vercel.json'), JSON.stringify(v)); assert.ok((checkStructure(d) as string[]).some((x) => x.includes('is a glob')));
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test('the build runs the guard first', () => { assert.match(readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8'), /assertStructure\(\)/); });
});
