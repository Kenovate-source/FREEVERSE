import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export class ConfigError extends Error {}

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicOrigin: string;
  databaseUrl?: string;
  dbSsl: boolean;
  sqlitePath: string;
  authProvider: 'dev' | 'supabase';
  supabase: { url?: string; anonKey?: string; serviceRoleKey?: string };
  founderEmail?: string;
  /** Signs short-lived media URLs. Required in production; random per process in development. */
  mediaUrlSecret: string;
  storage: { driver: 'local' | 'supabase'; dir: string; supabaseBucket: string };
  ai: { provider: 'demo' | 'anthropic'; anthropicApiKey?: string; novaModel: string; dailyMessageCap: number };
  anonymousPostingEnabled: boolean;
  novaFlagRetentionDays: number;
  devTools: boolean;
  seedDemoData: boolean;
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  staticDir: string;
}

const truthy = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const isLoopback = (h: string) => ['127.0.0.1', 'localhost', '::1'].includes(h);

/** Reads and validates environment configuration. Never prints secret values; messages only name variables. */
export function loadConfig(e: Record<string, string | undefined> = process.env): Config {
  const env = (e.NODE_ENV === 'production' ? 'production' : e.NODE_ENV === 'test' ? 'test' : 'development') as Config['env'];
  const prod = env === 'production';
  const host = e.HOST || '127.0.0.1';
  const port = Number(e.PORT || 5173);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError('PORT must be a valid port number.');

  const authProvider = (e.AUTH_PROVIDER || (e.SUPABASE_URL ? 'supabase' : 'dev')) as Config['authProvider'];
  if (authProvider !== 'dev' && authProvider !== 'supabase') throw new ConfigError('AUTH_PROVIDER must be "dev" or "supabase".');
  if (authProvider === 'supabase' && (!e.SUPABASE_URL || !e.SUPABASE_ANON_KEY)) {
    throw new ConfigError('AUTH_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
  if (authProvider === 'dev' && prod) {
    throw new ConfigError('The development auth provider does not verify passwords and is refused when NODE_ENV=production. Set AUTH_PROVIDER=supabase.');
  }
  if (authProvider === 'dev' && !isLoopback(host) && env !== 'test') {
    throw new ConfigError('The development auth provider only runs bound to a loopback address (HOST=127.0.0.1).');
  }
  if (prod && !e.DATABASE_URL) {
    throw new ConfigError('SQLite is a development and test stand-in only. Production requires DATABASE_URL pointing at PostgreSQL.');
  }
  const aiProvider = (e.AI_PROVIDER || (e.ANTHROPIC_API_KEY ? 'anthropic' : 'demo')) as Config['ai']['provider'];
  if (aiProvider !== 'demo' && aiProvider !== 'anthropic') throw new ConfigError('AI_PROVIDER must be "demo" or "anthropic".');
  if (aiProvider === 'anthropic' && !e.ANTHROPIC_API_KEY) throw new ConfigError('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.');
  const storageDriver = (e.STORAGE_DRIVER || 'local') as Config['storage']['driver'];
  if (storageDriver !== 'local' && storageDriver !== 'supabase') throw new ConfigError('STORAGE_DRIVER must be "local" or "supabase".');
  if (storageDriver === 'supabase' && (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new ConfigError('STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only).');
  }
  if (prod && !e.MEDIA_URL_SECRET) throw new ConfigError('Production requires MEDIA_URL_SECRET (a long random string used to sign media URLs).');
  const retention = Number(e.NOVA_FLAG_RETENTION_DAYS || 30);
  if (!Number.isFinite(retention) || retention < 1 || retention > 365) throw new ConfigError('NOVA_FLAG_RETENTION_DAYS must be between 1 and 365.');

  return {
    env, host, port,
    publicOrigin: e.PUBLIC_ORIGIN || `http://localhost:${port}`,
    databaseUrl: e.DATABASE_URL || undefined,
    dbSsl: truthy(e.DATABASE_SSL, prod),
    sqlitePath: resolve(e.SQLITE_PATH || '.data/freeverse.sqlite'),
    authProvider,
    supabase: { url: e.SUPABASE_URL?.replace(/\/+$/, ''), anonKey: e.SUPABASE_ANON_KEY, serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY },
    founderEmail: e.FOUNDER_EMAIL?.trim().toLowerCase() || undefined,
    mediaUrlSecret: e.MEDIA_URL_SECRET || randomBytes(32).toString('hex'),
    storage: { driver: storageDriver, dir: resolve(e.UPLOAD_DIR || '.data/uploads'), supabaseBucket: e.SUPABASE_STORAGE_BUCKET || 'freeverse-media' },
    ai: { provider: aiProvider, anthropicApiKey: e.ANTHROPIC_API_KEY, novaModel: e.NOVA_MODEL || 'claude-sonnet-5-5', dailyMessageCap: Number(e.AI_DAILY_MESSAGE_CAP || 60) },
    anonymousPostingEnabled: truthy(e.ANONYMOUS_POSTING_ENABLED, true),
    novaFlagRetentionDays: retention,
    devTools: truthy(e.ENABLE_DEV_TOOLS, !prod),
    seedDemoData: truthy(e.SEED_DEMO_DATA, !prod),
    logLevel: (e.LOG_LEVEL as Config['logLevel']) || (env === 'test' ? 'silent' : 'info'),
    staticDir: resolve(e.STATIC_DIR || 'dist'),
  };
}

/** A config safe to send to the browser or write to logs (no secrets). */
export function publicConfigSummary(c: Config) {
  return {
    env: c.env,
    authProvider: c.authProvider,
    database: c.databaseUrl ? 'postgres' : 'sqlite',
    aiProvider: c.ai.provider,
    storage: c.storage.driver,
    anonymousPostingEnabled: c.anonymousPostingEnabled,
    novaFlagRetentionDays: c.novaFlagRetentionDays,
    devTools: c.devTools,
  };
}
