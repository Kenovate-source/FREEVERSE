import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './types';

export function findMigrationsDir(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.MIGRATIONS_DIR,
    resolve(process.cwd(), 'migrations'),
    fileURLToPath(new URL('../../migrations', import.meta.url)),
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(join(c, 'sqlite')) && existsSync(join(c, 'postgres'))) return c;
  throw new Error(`Could not find the migrations directory (looked in: ${candidates.join(', ')})`);
}

export interface MigrationResult { applied: string[]; alreadyApplied: string[] }

/** Applies migrations/<dialect>/*.sql in filename order, each in its own transaction, recording them in schema_migrations. */
export async function migrate(db: Db, dir?: string): Promise<MigrationResult> {
  const base = findMigrationsDir(dir);
  const folder = join(base, db.dialect);
  const files = readdirSync(folder).filter((f) => f.endsWith('.sql')).sort();
  await db.exec(
    db.dialect === 'postgres'
      ? 'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
      : "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
  );
  const done = new Set((await db.query<{ version: string }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(folder, f), 'utf8');
    await db.tx(async (t) => {
      await t.exec(sql);
      await t.run('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
    });
    applied.push(f);
  }
  return { applied, alreadyApplied: files.filter((f) => done.has(f)) };
}
