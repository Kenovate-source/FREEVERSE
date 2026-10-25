import { loadConfig, ConfigError } from './config';
import { createServices } from './bootstrap';
import { createApp } from './app';
import { startJobs } from './jobs';

async function main() {
  let config;
  try { config = loadConfig(); }
  catch (e) {
    if (e instanceof ConfigError) { console.error(`Configuration error: ${e.message}`); process.exit(1); }
    throw e;
  }
  const s = await createServices(config);
  const app = await createApp(s);
  const srv = await app.listen(config.port, config.host);
  const addr = srv.address();
  const port = typeof addr === 'object' && addr ? addr.port : config.port;
  s.log.info('listening', { url: `http://${config.host}:${port}`, auth: s.auth.kind, db: s.db.dialect, ai: s.ai.provider, env: config.env });
  if (s.auth.kind === 'dev') s.log.warn('dev_auth_active', { note: 'Local development sign-in: passwords are NOT checked. Not for production.' });
  const stopJobs = startJobs(s);
  const stop = async () => { stopJobs(); srv.close(); await s.db.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
