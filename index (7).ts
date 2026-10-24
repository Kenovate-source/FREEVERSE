import type { Db } from './types';
import { openSqlite } from './sqlite';
import { openPostgres } from './postgres';

export type { Db, Row, Dialect } from './types';
export * from './helpers';
export { migrate } from './migrate';

export function openDatabase(opts: { databaseUrl?: string; sqlitePath: string; ssl?: boolean }): Db {
  if (opts.databaseUrl) return openPostgres(opts.databaseUrl, { ssl: opts.ssl });
  return openSqlite(opts.sqlitePath);
}
