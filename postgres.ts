import pg from 'pg';
import type { Db, Row } from './types';

// Normalise driver output so rows look the same as on SQLite: counts as numbers, timestamps as ISO strings.
pg.types.setTypeParser(20, (v) => Number(v)); // int8 (COUNT, SUM of ints)
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
pg.types.setTypeParser(1114, (v) => new Date(v + 'Z').toISOString()); // timestamp (without tz) read as UTC

export function toPgParams(params: readonly unknown[] = []): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (p instanceof Date) return p.toISOString();
    if (p !== null && typeof p === 'object' && !(p instanceof Uint8Array)) return JSON.stringify(p);
    return p;
  });
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[]; rowCount: number | null }> };

function wrap(q: Queryable, tx: (fn: (db: Db) => Promise<unknown>) => Promise<unknown>, close: () => Promise<void>): Db {
  return {
    dialect: 'postgres',
    async query<T = Row>(sql: string, params?: readonly unknown[]) {
      const r = await q.query(sql, toPgParams(params));
      return r.rows as T[];
    },
    async get<T = Row>(sql: string, params?: readonly unknown[]) {
      const r = await q.query(sql, toPgParams(params));
      return r.rows[0] as T | undefined;
    },
    async run(sql, params) {
      const r = await q.query(sql, toPgParams(params));
      return { changes: r.rowCount ?? 0 };
    },
    async exec(sql) { await q.query(sql); },
    tx: ((fn: (db: Db) => Promise<unknown>) => tx(fn)) as Db['tx'],
    close,
  };
}

/** Production adapter: node-postgres pool against DATABASE_URL (e.g. a Supabase Postgres connection string). */
export function openPostgres(connectionString: string, opts: { ssl?: boolean; max?: number } = {}): Db {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 10, ssl: opts.ssl ? { rejectUnauthorized: true } : undefined });
  const asQueryable = (c: pg.Pool | pg.PoolClient): Queryable => ({
    query: (sql, params) => c.query(sql, params as unknown[]) as unknown as Promise<{ rows: Row[]; rowCount: number | null }>,
  });
  const txFn = async (fn: (db: Db) => Promise<unknown>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inner = wrap(asQueryable(client), async (nested) => {
        await client.query('SAVEPOINT nested');
        try { const o = await nested(inner); await client.query('RELEASE SAVEPOINT nested'); return o; }
        catch (e) { await client.query('ROLLBACK TO SAVEPOINT nested'); throw e; }
      }, async () => {});
      const out = await fn(inner);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* connection may be gone */ }
      throw e;
    } finally { client.release(); }
  };
  return wrap(asQueryable(pool), txFn, () => pool.end());
}
