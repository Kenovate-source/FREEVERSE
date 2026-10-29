import type { Db } from './types';
import { openSqlite } from './sqlite';
import { openPostgres, type PgSsl } from './postgres';

export type { Db, Row, Dialect } from './types';
export * from './helpers';
export { migrate } from './migrate';

export function openDatabase(opts: { databaseUrl?: string; sqlitePath: string; ssl?: PgSsl }): Db {
  if (opts.databaseUrl) return openPostgres(opts.databaseUrl, { ssl: opts.ssl });
  return openSqlite(opts.sqlitePath);
}
