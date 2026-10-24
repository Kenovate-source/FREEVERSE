import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Db, Row } from './types';

type SqlValue = string | number | null | bigint | Uint8Array;

export function toSqliteParams(params: readonly unknown[] = []): SqlValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    if (p instanceof Uint8Array) return p;
    if (typeof p === 'object') return JSON.stringify(p);
    return p as SqlValue;
  });
}
/** $1 -> ?1 (SQLite supports numbered parameters natively). */
export const toSqliteSql = (sql: string): string => sql.replace(/\$(\d+)/g, '?$1');

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    return release;
  }
}

export function openSqlite(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL;');
  const mutex = new Mutex();

  const direct = {
    query<T = Row>(sql: string, params?: readonly unknown[]): T[] {
      return raw.prepare(toSqliteSql(sql)).all(...toSqliteParams(params)).map((r) => ({ ...r })) as T[];
    },
    run(sql: string, params?: readonly unknown[]) {
      const r = raw.prepare(toSqliteSql(sql)).run(...toSqliteParams(params));
      return { changes: Number(r.changes) };
    },
  };

  const make = (guard: boolean): Db => ({
    dialect: 'sqlite',
    async query<T = Row>(sql: string, params?: readonly unknown[]) {
      const rel = guard ? await mutex.acquire() : null;
      try { return direct.query<T>(sql, params); } finally { rel?.(); }
    },
    async get<T = Row>(sql: string, params?: readonly unknown[]) {
      const rows = await this.query<T>(sql, params);
      return rows[0];
    },
    async run(sql, params) {
      const rel = guard ? await mutex.acquire() : null;
      try { return direct.run(sql, params); } finally { rel?.(); }
    },
    async exec(sql) {
      const rel = guard ? await mutex.acquire() : null;
      try { raw.exec(sql); } finally { rel?.(); }
    },
    async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      if (!guard) {
        // Nested call inside a transaction: use a savepoint.
        const name = `sp_${Math.random().toString(36).slice(2)}`;
        raw.exec(`SAVEPOINT ${name}`);
        try { const out = await fn(this); raw.exec(`RELEASE ${name}`); return out; }
        catch (e) { raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`); throw e; }
      }
      const rel = await mutex.acquire();
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out = await fn(make(false));
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      } finally { rel(); }
    },
    async close() { if (guard) raw.close(); },
  });
  return make(true);
}
