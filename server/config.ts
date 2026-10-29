import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export class ConfigError extends Error {}

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicOrigin: string;
  databaseUrl?: string;
  /** false = no TLS; true = TLS verified against the system trust store; object = explicit CA or (not recommended) no verification. */
  dbSsl: boolean | { rejectUnauthorized: boolean; ca?: string };
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
  /** How many reverse-proxy hops sit in front of the server (read from the right of X-Forwarded-For). */
  trustProxyHops: number;
  /** Shared secret that the Vercel API proxy sends so the server can trust its forwarded client IP. */
  proxySecret?: string;
}

const truthy = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const isLoopback = (h: string) => ['127.0.0.1', 'localhost', '::1'].includes(h);

/** Reads and validates environment configuration. Never prints secret values; messages only name variables. */
export function loadConfig(e: Record<string, string | undefined> = process.env): Config {
  const env = (e.NODE_ENV === 'production' ? 'production' : e.NODE_ENV === 'test' ? 'test' : 'development') as Config['env'];
  const prod = env === 'production';
  // Containers must listen on all interfaces; binding to loopback makes the service unreachable from the host's router.
  const host = e.HOST || (prod ? '0.0.0.0' : '127.0.0.1');
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
  if (prod) {
    let u: URL | null = null;
    try { u = new URL(e.PUBLIC_ORIGIN || ''); } catch { /* handled below */ }
    if (!u || u.protocol !== 'https:' || isLoopback(u.hostname) || u.pathname !== '/') {
      throw new ConfigError('Production requires PUBLIC_ORIGIN to be the public https:// origin of the website (for example https://your-site.vercel.app), with no path.');
    }
  }
  if (prod && (e.STORAGE_DRIVER || 'local') === 'local' && !truthy(e.ALLOW_EPHEMERAL_STORAGE, false)) {
    throw new ConfigError('Production uploads must not use local disk (hosts wipe it on redeploy). Set STORAGE_DRIVER=supabase, or set ALLOW_EPHEMERAL_STORAGE=true to accept that uploads can be lost.');
  }
  const hops = Number(e.TRUST_PROXY_HOPS ?? (prod ? 1 : 0));
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new ConfigError('TRUST_PROXY_HOPS must be an integer from 0 to 5.');
  if (e.PROXY_SHARED_SECRET && e.PROXY_SHARED_SECRET.length < 24) throw new ConfigError('PROXY_SHARED_SECRET must be at least 24 characters.');
  const aiProvider = (e.AI_PROVIDER || (e.ANTHROPIC_API_KEY ? 'anthropic' : 'demo')) as Config['ai']['provider'];
  if (aiProvider !== 'demo' && aiProvider !== 'anthropic') throw new ConfigError('AI_PROVIDER must be "demo" or "anthropic".');
  if (aiProvider === 'anthropic' && !e.ANTHROPIC_API_KEY) throw new ConfigError('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.');
  const storageDriver = (e.STORAGE_DRIVER || 'local') as Config['storage']['driver'];
  if (storageDriver !== 'local' && storageDriver !== 'supabase') throw new ConfigError('STORAGE_DRIVER must be "local" or "supabase".');
  if (storageDriver === 'supabase' && (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new ConfigError('STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only).');
  }
  if (prod && !e.MEDIA_URL_SECRET) throw new ConfigError('Production requires MEDIA_URL_SECRET (a long random string used to sign media URLs).');
  // Database TLS. Supabase's certificate chain is signed by its own CA, which Node does not trust by default, so either supply
  // that CA (DATABASE_SSL_CA, verified and recommended) or knowingly skip verification (DATABASE_SSL=no-verify).
  const sslMode = (e.DATABASE_SSL ?? '').trim().toLowerCase();
  const sslCa = e.DATABASE_SSL_CA?.trim() ? e.DATABASE_SSL_CA.replace(/\\n/g, '\n').trim() : undefined;
  if (sslCa && !/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(sslCa)) throw new ConfigError('DATABASE_SSL_CA must contain a PEM certificate (the text from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----).');
  const sslOn = sslMode === 'no-verify' || truthy(e.DATABASE_SSL, prod);
  const dbSsl: Config['dbSsl'] = !sslOn ? false : sslMode === 'no-verify' ? { rejectUnauthorized: false } : sslCa ? { rejectUnauthorized: true, ca: sslCa } : true;
  const retention = Number(e.NOVA_FLAG_RETENTION_DAYS || 30);
  if (!Number.isFinite(retention) || retention < 1 || retention > 365) throw new ConfigError('NOVA_FLAG_RETENTION_DAYS must be between 1 and 365.');

  return {
    env, host, port,
    publicOrigin: e.PUBLIC_ORIGIN || `http://localhost:${port}`,
    databaseUrl: e.DATABASE_URL || undefined,
    dbSsl,
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
    trustProxyHops: hops,
    proxySecret: e.PROXY_SHARED_SECRET || undefined,
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
