import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../server/config';
import { clientIp } from '../server/http/client-ip';
import { proxyRequest, backendOrigin, resolveTarget } from '../api/_proxy.mjs';
import { parseAuthReturn, authReturnRoute } from '../src/lib/auth-return';
import { startTestApp } from './helpers/app';

const PROD = {
  NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h:5432/d', AUTH_PROVIDER: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'svc', STORAGE_DRIVER: 'supabase', MEDIA_URL_SECRET: 'm'.repeat(32), PUBLIC_ORIGIN: 'https://freeverse.example.com',
};
const bad = (over: Record<string, string | undefined>, re: RegExp) => assert.throws(() => loadConfig({ ...PROD, ...over }), (e) => e instanceof ConfigError && re.test(e.message));

test('production config: a complete configuration loads and listens on all interfaces', () => {
  const c = loadConfig(PROD);
  assert.equal(c.host, '0.0.0.0'); assert.equal(c.authProvider, 'supabase'); assert.equal(c.anonymousPostingEnabled, true); assert.equal(c.trustProxyHops, 1);
});
test('production config: refuses dev auth, SQLite, missing media secret, bad origin, local uploads', () => {
  bad({ AUTH_PROVIDER: 'dev', SUPABASE_URL: undefined }, /development auth provider/);
  bad({ DATABASE_URL: undefined }, /DATABASE_URL/);
  bad({ MEDIA_URL_SECRET: undefined }, /MEDIA_URL_SECRET/);
  bad({ PUBLIC_ORIGIN: undefined }, /PUBLIC_ORIGIN/);
  bad({ PUBLIC_ORIGIN: 'http://freeverse.example.com' }, /PUBLIC_ORIGIN/);
  bad({ PUBLIC_ORIGIN: 'https://localhost' }, /PUBLIC_ORIGIN/);
  bad({ PUBLIC_ORIGIN: 'https://freeverse.example.com/app' }, /PUBLIC_ORIGIN/);
  bad({ STORAGE_DRIVER: 'local' }, /local disk/);
  bad({ SUPABASE_ANON_KEY: undefined }, /SUPABASE_ANON_KEY/);
  bad({ PROXY_SHARED_SECRET: 'short' }, /PROXY_SHARED_SECRET/);
  assert.equal(loadConfig({ ...PROD, STORAGE_DRIVER: 'local', ALLOW_EPHEMERAL_STORAGE: 'true' }).storage.driver, 'local');
});
test('anonymous posting is ON by default (Founder decision) and an explicit switch can turn it off', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).anonymousPostingEnabled, true, 'anonymous posting is on by default (Founder decision)');
  assert.equal(loadConfig({ NODE_ENV: 'test', ANONYMOUS_POSTING_ENABLED: 'false' }).anonymousPostingEnabled, false, 'and can still be switched off');
  assert.equal(loadConfig({ ...PROD, ANONYMOUS_POSTING_ENABLED: 'true' }).anonymousPostingEnabled, true);
});

const req = (headers: Record<string, string>, remote = '10.0.0.1') => ({ headers, socket: { remoteAddress: remote } }) as never;
test('client IP: ignores forwarded headers unless configured; cannot be spoofed from the left', () => {
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.1.1.1' }), { trustProxyHops: 0 }), '10.0.0.1');
  assert.equal(clientIp(req({ 'x-forwarded-for': 'spoofed, 2.2.2.2' }), { trustProxyHops: 1 }), '2.2.2.2');
  assert.equal(clientIp(req({ 'x-forwarded-for': '3.3.3.3, 4.4.4.4' }), { trustProxyHops: 2 }), '3.3.3.3');
  assert.equal(clientIp(req({ 'x-fv-client-ip': '5.5.5.5' }), { trustProxyHops: 0, proxySecret: 's'.repeat(24) }), '10.0.0.1');
  assert.equal(clientIp(req({ 'x-fv-client-ip': '5.5.5.5', 'x-fv-proxy-secret': 'wrong' }), { trustProxyHops: 0, proxySecret: 's'.repeat(24) }), '10.0.0.1');
  assert.equal(clientIp(req({ 'x-fv-client-ip': '5.5.5.5', 'x-fv-proxy-secret': 's'.repeat(24) }), { trustProxyHops: 0, proxySecret: 's'.repeat(24) }), '5.5.5.5');
});

test('API proxy: reports a missing/unsafe BACKEND_URL honestly instead of returning HTML', async () => {
  assert.equal(backendOrigin({}), null); assert.equal(backendOrigin({ BACKEND_URL: 'http://evil.example.com' }), null); assert.equal(backendOrigin({ BACKEND_URL: 'https://api.example.com/x' }), 'https://api.example.com');
  const r = await proxyRequest(new Request('https://site.test/api/config'), {});
  assert.equal(r.status, 503); assert.equal(r.headers.get('content-type')?.startsWith('application/json'), true);
  assert.equal(((await r.json()) as any).error.code, 'backend_not_configured');
});
test('API proxy: forwards method, path, body and auth; adds trusted client IP; strips hop headers', async () => {
  let seen: { url: string; init: any } | null = null;
  const fetchImpl = (async (url: string, init: any) => { seen = { url, init }; return new Response('{"ok":true}', { status: 201, headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'set-cookie': 'x=1' } }); }) as never;
  const r = await proxyRequest(new Request('https://site.test/api/auth/signin?a=1', { method: 'POST', body: '{"e":1}', headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'x-vercel-forwarded-for': '9.9.9.9', 'x-fv-client-ip': 'forged', 'x-fv-proxy-secret': 'forged' } }),
    { BACKEND_URL: 'https://api.example.com', PROXY_SHARED_SECRET: 'p'.repeat(24) }, fetchImpl);
  assert.equal(r.status, 201); assert.equal(r.headers.get('content-encoding'), null); assert.equal(r.headers.get('set-cookie'), null);
  assert.equal(seen!.url, 'https://api.example.com/api/auth/signin?a=1'); assert.equal(seen!.init.method, 'POST');
  const h = seen!.init.headers as Headers;
  assert.equal(h.get('authorization'), 'Bearer t'); assert.equal(h.get('x-fv-client-ip'), '9.9.9.9'); assert.equal(h.get('x-fv-proxy-secret'), 'p'.repeat(24));
});
test('API proxy: backend down or slow becomes a clear JSON error', async () => {
  const env = { BACKEND_URL: 'https://api.example.com' };
  const down = await proxyRequest(new Request('https://site.test/api/config'), env, (async () => { throw new Error('ECONNREFUSED'); }) as never);
  assert.equal(down.status, 502); assert.equal(((await down.json()) as any).error.code, 'backend_unreachable');
  const slow = await proxyRequest(new Request('https://site.test/api/config'), env, (async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }) as never);
  assert.equal(slow.status, 504);
  assert.equal((await proxyRequest(new Request('https://site.test/other'), env)).status, 404);
});

test('email-confirmation and recovery returns are consumed, not routed', () => {
  assert.deepEqual(parseAuthReturn('#access_token=abc&refresh_token=r&type=signup'), { kind: 'session', token: 'abc', type: 'signup' });
  assert.equal(authReturnRoute({ kind: 'session', token: 'a', type: 'recovery' }), '/reset-password');
  assert.equal(authReturnRoute({ kind: 'session', token: 'a', type: 'signup' }), '/home');
  assert.deepEqual(parseAuthReturn('#error=access_denied&error_code=otp_expired'), { kind: 'error', code: 'otp_expired' });
  assert.equal(authReturnRoute({ kind: 'error', code: 'otp_expired' }), '/signin?notice=link_expired');
  assert.equal(parseAuthReturn('#/home'), null); assert.equal(parseAuthReturn(''), null); assert.equal(parseAuthReturn('#/learn?x=1'), null);
});

test('health endpoints: liveness and readiness, no secrets', async () => {
  const t = await startTestApp('sqlite');
  try {
    const a = await t.call('GET', '/api/health'); assert.equal(a.status, 200); assert.equal(a.json.ok, true);
    const b = await t.call('GET', '/api/health/ready'); assert.equal(b.status, 200); assert.equal(b.json.database, 'ok');
    assert.doesNotMatch(JSON.stringify(b.json), /key|secret|password|postgres:/i);
  } finally { await t.close(); }
});
test('behind a proxy each visitor gets their own sign-up quota (not one shared IP)', async () => {
  const t = await startTestApp('sqlite', { TRUST_PROXY_HOPS: '1' });
  try {
    for (let i = 0; i < 10; i++) { const r = await t.call('POST', '/api/auth/signup', { body: { email: `a${i}@x.test`, password: 'Passw0rd!long', confirmAgeRange: true }, headers: { 'x-forwarded-for': '7.7.7.7' } }); assert.equal(r.status, 200); }
    assert.equal((await t.call('POST', '/api/auth/signup', { body: { email: 'z@x.test', password: 'Passw0rd!long', confirmAgeRange: true }, headers: { 'x-forwarded-for': '7.7.7.7' } })).status, 429);
    assert.equal((await t.call('POST', '/api/auth/signup', { body: { email: 'y@x.test', password: 'Passw0rd!long', confirmAgeRange: true }, headers: { 'x-forwarded-for': '8.8.8.8' } })).status, 200);
  } finally { await t.close(); }
});

test('Vercel config: no glob-unsafe function pattern; the rewrite targets a real function file', async () => {
  const { readFileSync, existsSync, readdirSync } = await import('node:fs');
  const vj = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  // Regression: `functions: {"api/[...path].mjs": ...}` treated the brackets as a glob class, matched nothing, and failed the build.
  for (const k of Object.keys(vj.functions ?? {})) assert.doesNotMatch(k, /[\[\]]/, `functions pattern ${k} must not contain glob brackets`);
  const rw = vj.rewrites.find((r: any) => r.source === '/api/:__fvp*'); assert.ok(rw, 'rewrite for /api/:__fvp*');
  const dest = /^\/api\/([a-z]+)$/.exec(rw.destination); assert.ok(dest, 'rewrite destination shape');
  assert.ok(existsSync(new URL(`../api/${dest![1]}.mjs`, import.meta.url)), 'destination function file exists');
  for (const f of readdirSync(new URL('../api/', import.meta.url))) assert.doesNotMatch(f, /[\[\]]/, `api/${f}: no bracketed file names`);
  const mod: any = await import('../api/proxy.mjs');
  for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) assert.equal(typeof mod[m], 'function', `exports ${m}`);
  assert.equal(mod.config.maxDuration, 30);
});
test('API proxy: rewritten requests keep the real multi-segment path and query', async () => {
  const r = (u: string) => resolveTarget(new URL(u));
  assert.deepEqual(r('https://s.test/api/proxy?__fvp=auth/signup'), { pathname: '/api/auth/signup', search: '' });
  assert.deepEqual(r('https://s.test/api/proxy?__fvp=health/ready&a=1&b=x%20y'), { pathname: '/api/health/ready', search: '?a=1&b=x+y' });
  assert.deepEqual(r('https://s.test/api/posts?q=1'), { pathname: '/api/posts', search: '?q=1' });
  assert.equal(r('https://s.test/api/proxy'), null); assert.equal(r('https://s.test/api/proxy?__fvp=../secret'), null); assert.equal(r('https://s.test/api/proxy?__fvp=/x'), null);
  let seen = ''; const f = (async (u: string) => { seen = u; return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); }) as never;
  await proxyRequest(new Request('https://s.test/api/proxy?__fvp=universes/spaces/x&limit=5', { method: 'PUT', body: '{}' }), { BACKEND_URL: 'https://b.example.com' }, f);
  assert.equal(seen, 'https://b.example.com/api/universes/spaces/x?limit=5');
});
test('API proxy: upstream status codes and error bodies are propagated, never fabricated', async () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503]) {
    const f = (async () => new Response(JSON.stringify({ error: { code: 'x', message: 'm' } }), { status, headers: { 'content-type': 'application/json' } })) as never;
    const r = await proxyRequest(new Request('https://s.test/api/me'), { BACKEND_URL: 'https://b.example.com' }, f);
    assert.equal(r.status, status); assert.equal(((await r.json()) as any).error.code, 'x');
  }
  const redirect = (async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } })) as never;
  assert.equal((await proxyRequest(new Request('https://s.test/api/x'), { BACKEND_URL: 'https://b.example.com' }, redirect)).status, 302);
});

test('API proxy end to end against the real backend: config, health, sign-up body, auth header, 401, invalid body', async () => {
  const { startTestApp } = await import('./helpers/app');
  const t = await startTestApp('sqlite');
  try {
    const env = { BACKEND_URL: t.base, PROXY_SHARED_SECRET: 's'.repeat(32) };
    const via = (path: string, init?: RequestInit) => proxyRequest(new Request(`https://site.test/api/proxy?__fvp=${path}`, init), env);
    const cfg = await via('config'); assert.equal(cfg.status, 200); assert.equal(((await cfg.json()) as any).app.name, 'FREEVERSE');
    const ready = await via('health/ready'); assert.equal(ready.status, 200);
    const su = await via('auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proxy@example.com', password: 'correct-horse-battery', confirmAgeRange: true }) });
    assert.equal(su.status, 200); const tok = ((await su.json()) as any).session.accessToken;
    const me = await via('me', { headers: { authorization: `Bearer ${tok}` } }); assert.equal(me.status, 200);
    assert.equal((await via('me')).status, 401);
    assert.equal((await via('auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
    assert.equal((await via('no/such/route')).status, 404);
  } finally { await t.close(); }
});
