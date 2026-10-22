import type { Config } from './config';
import { openDatabase, migrate, type Db } from './db';
import { createLogger } from './log';
import type { Services } from './services';
import { RateLimiter } from './services/rate-limit';
import { createDevAuth } from './auth/dev';
import { createSupabaseAuth } from './auth/supabase';
import { createLocalStorage } from './storage/local';
import { createSupabaseStorage } from './storage/supabase';
import { createAiRuntime } from './ai/providers';
import { seedCore } from './seed/core';

export interface Overrides { db?: Db; now?: () => Date; auth?: Services['auth']; storage?: Services['storage']; ai?: Services['ai']; fetchImpl?: typeof fetch }

/** Builds the service container. Production wiring lives here; tests pass overrides. */
export async function createServices(config: Config, o: Overrides = {}): Promise<Services> {
  const log = createLogger(config.logLevel);
  const now = o.now ?? (() => new Date());
  const db = o.db ?? openDatabase({ databaseUrl: config.databaseUrl, sqlitePath: config.sqlitePath, ssl: config.dbSsl });
  const res = await migrate(db);
  if (res.applied.length) log.info('migrations_applied', { applied: res.applied });
  const auth = o.auth ?? (config.authProvider === 'supabase'
    ? createSupabaseAuth({ url: config.supabase.url!, anonKey: config.supabase.anonKey!, serviceRoleKey: config.supabase.serviceRoleKey, fetchImpl: o.fetchImpl })
    : createDevAuth(db, now));
  const storage = o.storage ?? (config.storage.driver === 'supabase'
    ? createSupabaseStorage({ url: config.supabase.url!, serviceRoleKey: config.supabase.serviceRoleKey!, bucket: config.storage.supabaseBucket, fetchImpl: o.fetchImpl })
    : createLocalStorage(config.storage.dir));
  const ai = o.ai ?? createAiRuntime(config, o.fetchImpl);
  const s: Services = { config, db, log, auth, storage, ai, rate: new RateLimiter(() => now().getTime()), now };
  await seedCore(s);
  return s;
}
