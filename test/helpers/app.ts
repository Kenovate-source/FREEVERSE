import type { Server } from 'node:http';
import { loadConfig, type Config } from '../../server/config';
import { createServices } from '../../server/bootstrap';
import { createApp, type App } from '../../server/app';
import { openSqlite } from '../../server/db/sqlite';
import { openPglite } from '../../server/db/pglite';
import type { Db, Dialect } from '../../server/db/types';
import type { Services } from '../../server/services';
import { createMemoryStorage } from '../../server/storage/local';

export const DIALECTS: Dialect[] = ['sqlite', 'postgres'];

export interface TestClock { now(): Date; set(d: Date | string): void; advance(ms: number): void }
export function clock(start = '2026-10-15T12:00:00.000Z'): TestClock {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), set: (d) => { t = new Date(d).getTime(); }, advance: (ms) => { t += ms; } };
}

export interface Reply { status: number; json: any; headers: Headers; buffer?: Buffer }
export interface TestApp {
  s: Services; app: App; db: Db; clock: TestClock; base: string; config: Config;
  call(method: string, path: string, o?: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: Buffer; contentType?: string }): Promise<Reply>;
  /** Creates an account through the real HTTP flow and returns its session token. Eligibility is NOT completed. */
  register(email: string): Promise<{ token: string; userId: string }>;
  /** register + confirm eligibility with a valid 18–24 birth date. Returns token and user id. */
  member(email: string, o?: { handle?: string; name?: string }): Promise<{ token: string; userId: string }>;
  /** Grants a role directly in the database (test setup only). */
  grantRole(userId: string, role: string): Promise<void>;
  close(): Promise<void>;
}

export async function startTestApp(dialect: Dialect = 'sqlite', env: Record<string, string> = {}, extra: { fetchImpl?: typeof fetch } = {}): Promise<TestApp> {
  const db = dialect === 'sqlite' ? openSqlite(':memory:') : await openPglite();
  const config = loadConfig({ NODE_ENV: 'test', AUTH_PROVIDER: 'dev', SEED_DEMO_DATA: '0', ...env });
  const clk = clock();
  const s = await createServices(config, { db, now: clk.now, storage: createMemoryStorage(), fetchImpl: extra.fetchImpl });
  const app = await createApp(s);
  const server: Server = await app.listen(0, '127.0.0.1');
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  async function call(method: string, path: string, o: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: Buffer; contentType?: string } = {}): Promise<Reply> {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    let body: BodyInit | undefined;
    if (o.raw) { headers['content-type'] = o.contentType ?? 'application/octet-stream'; body = new Uint8Array(o.raw); }
    else if (o.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(o.body); }
    const res = await fetch(base + path, { method, headers, body });
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
    return { status: res.status, json: null, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  }
  const t: TestApp = {
    s, app, db, clock: clk, base, config, call,
    async register(email) {
      const r = await call('POST', '/api/auth/signup', { body: { email, password: 'correct-horse-battery', confirmAgeRange: true } });
      if (r.status !== 200) throw new Error(`signup failed: ${r.status} ${JSON.stringify(r.json)}`);
      const token = r.json.session.accessToken as string;
      const me = await call('GET', '/api/me', { token });
      return { token, userId: me.json.user.id as string };
    },
    async member(email, o = {}) {
      const { token, userId } = await t.register(email);
      const r = await call('POST', '/api/me/eligibility', { token, body: { birthMonth: 3, birthDay: 14, birthYear: 2003, acceptTerms: true, confirmSelfDeclared: true } });
      if (r.status !== 200) throw new Error(`eligibility failed: ${r.status} ${JSON.stringify(r.json)}`);
      if (o.handle || o.name) await db.run('UPDATE users SET handle = COALESCE($2, handle), display_name = COALESCE($3, display_name) WHERE id = $1', [userId, o.handle ?? null, o.name ?? null]);
      return { token, userId };
    },
    async grantRole(userId, role) {
      const { uuid } = await import('../../server/db');
      await db.run('INSERT INTO role_grants (id, user_id, role, granted_at, reason) VALUES ($1,$2,$3,$4,$5)', [uuid(), userId, role, clk.now().toISOString(), 'test setup']);
    },
    async close() { await new Promise((ok) => server.close(ok)); await db.close(); },
  };
  return t;
}
