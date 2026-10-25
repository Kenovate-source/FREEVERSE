// Same-origin API proxy for Vercel. The browser only ever talks to https://<site>/api/...; this function forwards the
// request to the Node backend named by BACKEND_URL (server-side env var, never sent to the browser).
// Why a proxy: no CORS, no cross-site storage problems, the CSP stays `connect-src 'self'`, and the backend URL can change
// without rebuilding the client.

const DROP_REQUEST = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'x-fv-proxy-secret', 'x-fv-client-ip', 'forwarded']);
const DROP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie']);

const json = (status, code, message) => new Response(JSON.stringify({ error: { code, message } }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/**
 * vercel.json rewrites /api/:__fvp* to /api/proxy; Vercel then adds ?__fvp=<original path> (a plain file name, because `[...path]` file names are not
 * matched reliably for multi-segment paths). Depending on the runtime, request.url is either the original URL or the rewritten
 * one, so accept both and rebuild the real API path and query. Returns null for anything that is not an /api/ path.
 */
export function resolveTarget(u) {
  if (u.pathname === '/api/proxy') {
    const p = u.searchParams.get(PATH_PARAM);
    if (!p || p.includes('..') || p.startsWith('/') || p.includes('\\')) return null;
    u.searchParams.delete(PATH_PARAM);
    const qs = u.searchParams.toString();
    return { pathname: '/api/' + p, search: qs ? '?' + qs : '' };
  }
  if (!u.pathname.startsWith('/api/')) return null;
  return { pathname: u.pathname, search: u.search };
}
const PATH_PARAM = '__fvp';

/** Returns the validated backend origin, or null when BACKEND_URL is missing or unsafe. */
export function backendOrigin(env) {
  try {
    const u = new URL(env.BACKEND_URL || '');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return null;
    return u.origin;
  } catch { return null; }
}

export async function proxyRequest(request, env = process.env, fetchImpl = fetch) {
  const origin = backendOrigin(env);
  if (!origin) return json(503, 'backend_not_configured', 'The FREEVERSE service is not connected yet: BACKEND_URL is missing or invalid in the website’s deployment settings.');
  const inUrl = resolveTarget(new URL(request.url));
  if (!inUrl) return json(404, 'not_found', 'Unknown API route.');
  const headers = new Headers();
  for (const [k, v] of request.headers) if (!DROP_REQUEST.has(k.toLowerCase()) && !k.toLowerCase().startsWith('x-vercel-')) headers.set(k, v);
  const ip = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (ip) headers.set('x-fv-client-ip', ip);
  if (env.PROXY_SHARED_SECRET) headers.set('x-fv-proxy-secret', env.PROXY_SHARED_SECRET);
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let upstream;
  try {
    upstream = await fetchImpl(origin + inUrl.pathname + inUrl.search, {
      method: request.method, headers, body: hasBody ? await request.arrayBuffer() : undefined, redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return json(timeout ? 504 : 502, timeout ? 'backend_timeout' : 'backend_unreachable', timeout ? 'The FREEVERSE service took too long to respond (it may be waking up). Please try again in a moment.' : 'The FREEVERSE service could not be reached. Please try again shortly.');
  }
  const out = new Headers();
  for (const [k, v] of upstream.headers) if (!DROP_RESPONSE.has(k.toLowerCase())) out.set(k, v);
  return new Response(request.method === 'HEAD' || upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}
