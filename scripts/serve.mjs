// Tiny static server for dist/ (no dependencies). Routing is hash-based, so no SPA fallback is needed.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.map': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel.includes('..')) { res.writeHead(400).end('bad request'); return; }
    let file = join(root, rel || 'index.html');
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { /* handled below */ }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
});
server.listen(port, () => console.log(`FREEVERSE (Stage 1, mock data) running at http://localhost:${port}`));
