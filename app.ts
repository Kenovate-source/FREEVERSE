import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Services } from './services';
import { Router } from './http/router';
import { modules } from './modules';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
};

export interface App { handler(req: IncomingMessage, res: ServerResponse): Promise<void>; router: Router; listen(port: number, host: string): Promise<Server> }

export async function createApp(s: Services): Promise<App> {
  const router = new Router(s);
  for (const m of modules) m.register(router, s);
  for (const m of modules) if (m.seed) await m.seed(s);

  async function serveStatic(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const root = resolve(s.config.staticDir);
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (rel.endsWith('/') || rel === '') rel = join(rel, 'index.html');
    let file = resolve(join(root, rel));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); res.end(); return; }
    try { if (!(await stat(file)).isFile()) throw new Error('not file'); }
    catch {
      if (extname(rel)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
      file = join(root, 'index.html'); // client-side routes
    }
    try {
      const data = await readFile(file);
      const ext = extname(file);
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Build the client first: npm run build');
    }
  }

  async function handler(req: IncomingMessage, res: ServerResponse) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (path === '/api/health' || path === '/api/health/ready') {
      // Liveness never touches the database; readiness does. Neither returns secrets or configuration values.
      let ready = true; let dbOk: boolean | undefined;
      if (path.endsWith('/ready')) { try { await s.db.get('SELECT 1 AS ok'); dbOk = true; } catch { dbOk = false; ready = false; } }
      res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: ready, service: 'freeverse-api', env: s.config.env, ...(dbOk === undefined ? {} : { database: dbOk ? 'ok' : 'unreachable' }) }));
      return;
    }
    if (path.startsWith('/api/')) {
      // Dev-only failure injection so error and loading states can be exercised honestly.
      const sim = s.config.devTools ? String(req.headers['x-fv-sim'] ?? '') : '';
      if (sim === 'slow') await new Promise((r) => setTimeout(r, 2500));
      if (sim === 'error' && path !== '/api/config') {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'simulated_failure', message: 'Simulated failure (dev tools).' } }));
        return;
      }
      if (!(await router.handle(req, res))) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'not_found', message: 'Unknown API route.' } })); }
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    await serveStatic(req, res);
  }

  return {
    handler, router,
    listen: (port, host) => new Promise((ok, fail) => {
      const srv = createServer((q, r) => { handler(q, r).catch((e) => { s.log.error('fatal_handler_error', { err: String(e) }); if (!r.headersSent) r.writeHead(500); r.end(); }); });
      srv.once('error', fail);
      srv.listen(port, host, () => ok(srv));
    }),
  };
}
