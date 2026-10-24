// Real PostgreSQL (compiled to WASM) running in-process. Used by tests so PostgreSQL-specific behaviour
// (types, constraints, partial indexes, triggers, RLS statements) is exercised without a database server.
import { PGlite, types } from '@electric-sql/pglite';
import type { Db, Row } from './types';
import { toPgParams } from './postgres';

export async function openPglite(): Promise<Db> {
  const lite = new PGlite({
    parsers: {
      [types.INT8]: (v: string) => Number(v),
      [types.NUMERIC]: (v: string) => Number(v),
      [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
    },
  });
  await lite.waitReady;
  type Q = { query: PGlite['query'] };
  const wrap = (q: Q, tx: (fn: (db: Db) => Promise<unknown>) => Promise<unknown>, close: () => Promise<void>, exec: (s: string) => Promise<void>): Db => ({
    dialect: 'postgres',
    async query<T = Row>(sql: string, params?: readonly unknown[]) {
      const r = await q.query<T>(sql, toPgParams(params));
      return r.rows as T[];
    },
    async get<T = Row>(sql: string, params?: readonly unknown[]) {
      const r = await q.query<T>(sql, toPgParams(params));
      return r.rows[0];
    },
    async run(sql, params) {
      const r = await q.query(sql, toPgParams(params));
      return { changes: r.affectedRows ?? 0 };
    },
    exec,
    tx: ((fn: (db: Db) => Promise<unknown>) => tx(fn)) as Db['tx'],
    close,
  });
  const top: Db = wrap(lite, async (fn) => lite.transaction(async (t) => {
    const inner: Db = wrap(t as unknown as Q, async (nested) => {
      await t.query('SAVEPOINT nested');
      try { const o = await nested(inner); await t.query('RELEASE SAVEPOINT nested'); return o; }
      catch (e) { await t.query('ROLLBACK TO SAVEPOINT nested'); throw e; }
    }, async () => {}, async (s) => { await t.exec(s); });
    return fn(inner);
  }), () => lite.close(), async (s) => { await lite.exec(s); });
  return top;
}
