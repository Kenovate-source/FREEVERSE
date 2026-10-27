import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Config } from '../config';

const strip = (v: string) => v.trim().replace(/^::ffff:/, '');
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The address used for per-IP rate limits. Behind a reverse proxy the socket address is the proxy, so without this every
 * visitor would share one sign-up quota. Forwarded headers are only believed when configured:
 *  1. the Vercel API proxy proves itself with PROXY_SHARED_SECRET and supplies x-fv-client-ip;
 *  2. otherwise, with TRUST_PROXY_HOPS=n, the client is the n-th entry from the right of X-Forwarded-For
 *     (entries further left can be forged by the visitor and are ignored).
 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>, c: Pick<Config, 'trustProxyHops' | 'proxySecret'>): string {
  const sock = strip(req.socket.remoteAddress ?? 'unknown');
  const secret = req.headers['x-fv-proxy-secret'];
  const fwd = req.headers['x-fv-client-ip'];
  if (c.proxySecret && typeof secret === 'string' && safeEq(secret, c.proxySecret) && typeof fwd === 'string' && fwd.trim()) return strip(fwd.split(',')[0]!).slice(0, 64);
  if (c.trustProxyHops > 0) {
    const xff = req.headers['x-forwarded-for'];
    const parts = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').map(strip).filter(Boolean);
    const at = parts.length - c.trustProxyHops;
    if (at >= 0 && parts[at]) return parts[at]!.slice(0, 64);
  }
  return sock;
}
