export type Row = Record<string, unknown>;
export type Dialect = 'sqlite' | 'postgres';

/**
 * Persistence abstraction (Decision 1). SQL is written with numbered placeholders ($1, $2, ...) and a portable subset.
 * PostgreSQL is the production datastore; SQLite is a development/test stand-in and must never be used in production.
 *
 * Value conventions that hold on both dialects:
 *  - booleans are accepted as JS booleans and returned as boolean (PG) or 0/1 (SQLite): read with bool()
 *  - timestamps are written as ISO strings and returned as ISO strings
 *  - plain objects/arrays passed as parameters are JSON-stringified; JSON columns are read with json()
 *  - COUNT()/SUM() results come back as JS numbers
 */
export interface Db {
  readonly dialect: Dialect;
  query<T = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  run(sql: string, params?: readonly unknown[]): Promise<{ changes: number }>;
  /** Runs fn inside a transaction; commits on return, rolls back on throw. The handle passed to fn must be used inside. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Execute multiple statements (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
