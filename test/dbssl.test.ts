// Database TLS: the live Render failure was "self-signed certificate in certificate chain" against Supabase's pooler.
// These tests reproduce that failure with a real TLS handshake and show each supported fix, without any external service.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { loadConfig, publicConfigSummary, ConfigError } from '../server/config';
import { pgSslOptions } from '../server/db/postgres';

const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db.example:5432/d', PUBLIC_ORIGIN: 'https://site.example', AUTH_PROVIDER: 'supabase', STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_ANON_KEY: 'a', MEDIA_URL_SECRET: 'm'.repeat(40) };
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

describe('DATABASE_SSL configuration', () => {
  test('production default verifies certificates with the system trust store', () => { assert.equal(loadConfig(base).dbSsl, true); });
  test('DATABASE_SSL=false turns TLS off', () => { assert.equal(loadConfig({ ...base, DATABASE_SSL: 'false' }).dbSsl, false); });
  test('DATABASE_SSL_CA keeps verification on, against that CA (\\n escapes are accepted)', () => {
    assert.deepEqual(loadConfig({ ...base, DATABASE_SSL_CA: PEM }).dbSsl, { rejectUnauthorized: true, ca: PEM });
    assert.deepEqual(loadConfig({ ...base, DATABASE_SSL_CA: PEM.replace(/\n/g, '\\n') }).dbSsl, { rejectUnauthorized: true, ca: PEM });
  });
  test('DATABASE_SSL=no-verify is explicit and encrypted but unverified', () => { assert.deepEqual(loadConfig({ ...base, DATABASE_SSL: 'no-verify' }).dbSsl, { rejectUnauthorized: false }); });
  test('a CA that is not a PEM certificate is refused with a clear message', () => { assert.throws(() => loadConfig({ ...base, DATABASE_SSL_CA: 'hello' }), (e) => e instanceof ConfigError && /PEM certificate/.test(e.message)); });
  test('development without DATABASE_SSL does not use TLS', () => { assert.equal(loadConfig({ NODE_ENV: 'development' }).dbSsl, false); });
  test('the public config summary never carries the database URL or certificate', () => { const j = JSON.stringify(publicConfigSummary(loadConfig({ ...base, DATABASE_SSL_CA: PEM }))); assert.ok(!j.includes('postgres://') && !j.includes('BEGIN CERTIFICATE') && !j.includes('dbSsl')); });
  test('pgSslOptions maps each setting', () => {
    assert.equal(pgSslOptions(undefined), undefined); assert.equal(pgSslOptions(false), undefined);
    assert.deepEqual(pgSslOptions(true), { rejectUnauthorized: true });
    assert.deepEqual(pgSslOptions({ rejectUnauthorized: false }), { rejectUnauthorized: false });
    assert.deepEqual(pgSslOptions({ rejectUnauthorized: true, ca: 'x' }), { rejectUnauthorized: true, ca: 'x' });
  });
});

describe('real TLS handshake against a database presenting a private-CA certificate', () => {
  let dir = ''; let server: net.Server; let port = 0; let cert = '';
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fv-tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    cert = readFileSync(join(dir, 'c.pem'), 'utf8'); const key = readFileSync(join(dir, 'k.pem'), 'utf8');
    // Minimal "Postgres": answers the SSLRequest with 'S', then speaks TLS; after the handshake it just closes.
    server = net.createServer((raw) => {
      raw.once('data', () => { raw.write('S'); const t = new tls.TLSSocket(raw, { isServer: true, key, cert }); t.on('error', () => {}); t.on('secure', () => t.destroy()); });
      raw.on('error', () => {});
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r())); port = (server.address() as net.AddressInfo).port;
  });
  after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });
  const attempt = async (ssl: Parameters<typeof pgSslOptions>[0]) => {
    const pool = new pg.Pool({ connectionString: `postgres://u:p@localhost:${port}/d`, ssl: pgSslOptions(ssl), max: 1, connectionTimeoutMillis: 4000 });
    pool.on('error', () => {}); try { await pool.query('select 1'); return 'ok'; } catch (e) { return (e as NodeJS.ErrnoException).code ?? (e as Error).message; } finally { await pool.end().catch(() => {}); }
  };
  test('default verification rejects the private CA: the exact production failure', async () => { const r = await attempt(true); assert.match(String(r), /DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY/); });
  test('supplying that CA passes the TLS check (verification stays on)', async () => { const r = await attempt({ rejectUnauthorized: true, ca: cert }); assert.doesNotMatch(String(r), /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/); });
  test('no-verify passes the TLS check', async () => { const r = await attempt({ rejectUnauthorized: false }); assert.doesNotMatch(String(r), /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/); });
  test('a different CA is still rejected', async () => {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k2.pem'), '-out', join(dir, 'c2.pem'), '-days', '2', '-subj', '/CN=other'], { stdio: 'ignore' });
    const r = await attempt({ rejectUnauthorized: true, ca: readFileSync(join(dir, 'c2.pem'), 'utf8') }); assert.match(String(r), /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/);
  });
});
