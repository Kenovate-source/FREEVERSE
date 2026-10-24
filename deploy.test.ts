import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../server/config';
import { clientIp } from '../server/http/client-ip';
import { proxyRequest, backendOrigin } from '../api/_proxy.mjs';
import { parseAuthReturn, authReturnRoute } from '../src/lib/auth-return';
import { startTestApp } from './helpers/app';

const PROD = {
  NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h:5432/d', AUTH_PROVIDER: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'svc', STORAGE_DRIVER: 'supabase', MEDIA_URL_SECRET: 'm'.repeat(32), PUBLIC_ORIGIN: 'https://freeverse.example.com',
};
const bad = (over: Record<string, string | undefined>, re: RegExp) => assert.throws(() => loadConfig({ ...PROD, ...over }), (e) => e instanceof ConfigError && re.test(e.message));

test('production config: a complete configuration loads and listens on all interfaces', () => {
  const c = loadConfig(PROD);
  assert.equal(c.host, '0.0.0.0'); assert.equal(c.authProvider, 'supabase'); assert.equal(c.anonymousPostingEnabled, false); assert.equal(c.trustProxyHops, 1);
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
test('anonymous posting is OFF by default and only an explicit switch enables it', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).anonymousPostingEnabled, false);
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
