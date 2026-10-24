// Verifies a deployed FREEVERSE site end to end from the outside. Usage:
//   node scripts/check-deploy.mjs https://your-site.vercel.app [https://your-backend.onrender.com]
// It only sends GET requests and never prints secrets. Exit code 1 if any check fails.
const [site, backend] = process.argv.slice(2).map((u) => u?.replace(/\/+$/, ''));
if (!site) { console.error('Usage: node scripts/check-deploy.mjs <site-url> [backend-url]'); process.exit(2); }
let failed = 0;
const line = (ok, name, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const get = async (url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(60_000) }); const ct = r.headers.get('content-type') ?? ''; return { r, ct, body: ct.includes('json') ? await r.json().catch(() => null) : await r.text().catch(() => '') }; } catch (e) { return { err: String(e.cause?.code ?? e.message) }; } };

const home = await get(`${site}/`);
line(home.r?.ok && /<div id="root">/.test(home.body), 'website serves the app shell', home.err ?? `HTTP ${home.r?.status}`);
for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options']) line(!!home.r?.headers.get(h), `website sends ${h}`);

const health = await get(`${site}/api/health`);
line(health.body?.ok === true, 'site → backend: /api/health reaches the Node service', health.err ?? (health.body?.error?.code ?? `HTTP ${health.r?.status}`));
const ready = await get(`${site}/api/health/ready`);
line(ready.body?.database === 'ok', 'backend can reach PostgreSQL (/api/health/ready)', ready.body?.database ?? ready.body?.error?.code ?? '');
const cfg = await get(`${site}/api/config`);
const c = cfg.body;
line(c?.app?.name === 'FREEVERSE', '/api/config returns JSON (not an HTML page)', cfg.ct);
line(c?.auth?.kind === 'supabase' && c?.auth?.managed === true, 'sign-in is managed Supabase Auth (not the dev provider)', c?.auth?.kind);
line(c?.features?.env === 'production', 'backend runs with NODE_ENV=production', c?.features?.env);
line(c?.features?.database === 'postgres', 'backend uses PostgreSQL', c?.features?.database);
line(c?.features?.devTools === false, 'dev tools are off');
line(c?.features?.anonymousPosting === false, 'anonymous posting is off by default (launch decision)');
line(c?.eligibility?.verified === false && c?.eligibility?.min === 18 && c?.eligibility?.max === 24, 'age policy is 18–24, self-declared (not "verified")');
console.log(`INFO  storage driver: ${c?.features?.storage ?? 'unknown'}; AI provider: ${c?.features?.aiProvider ?? 'unknown'} (demo = labelled sample replies)`);
if (backend) {
  const direct = await get(`${backend}/api/health/ready`);
  line(direct.body?.ok === true, 'backend direct: /api/health/ready', direct.err ?? `HTTP ${direct.r?.status}`);
}
console.log(failed ? `\n${failed} check(s) failed. See docs/DEPLOYMENT.md → Troubleshooting.` : '\nAll checks passed. (Sign-up/sign-in still needs one manual run-through: docs/DEPLOYMENT.md → Verify.)');
process.exit(failed ? 1 : 0);
