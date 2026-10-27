import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodType } from 'zod';
import type { Db } from '../db';
import type { Logger } from '../log';
import type { Services } from '../services';
import type { Principal } from '../authz/principal';
import type { Permission } from '../authz/permissions';
import { HttpError, badRequest, forbidden, unauthorized } from './errors';
import { authenticate } from '../auth/session';
import { verifyStepUp } from '../authz/step-up';
import { clientIp } from './client-ip';

export class Reply {
  constructor(public status: number, public body: unknown, public headers: Record<string, string> = {}, public binary?: Buffer) {}
}
export const created = (body: unknown) => new Reply(201, body);
export const noContent = () => new Reply(204, undefined);
export const binary = (data: Buffer, mime: string, headers: Record<string, string> = {}) =>
  new Reply(200, undefined, { 'content-type': mime, ...headers }, data);

export type AuthMode = 'none' | 'session' | 'active' | { perm: Permission };

export interface RouteOptions<B = unknown, Q = unknown> {
  /** none: public. session: any signed-in account (including one still awaiting the eligibility check).
   *  active: signed in AND eligible (the default for product features). {perm}: active + that permission. */
  auth?: AuthMode;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  /** Raw binary request body (uploads). */
  raw?: { maxBytes: number };
  rate?: { key: string; limit: number; windowMs: number; by?: 'user' | 'ip' };
}

export interface Ctx<B = unknown, Q = unknown> {
  s: Services;
  db: Db;
  log: Logger;
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: Q;
  body: B;
  rawBody: Buffer | null;
  ip: string;
  principal: Principal | null;
  /** The signed-in principal. Throws on public routes. */
  readonly me: Principal;
  now(): Date;
  header(name: string): string | undefined;
  can(perm: Permission): boolean;
  /** Throws 403 `step_up_required` unless the request carries a valid X-Step-Up token for this person. */
  requireStepUp(): Promise<void>;
}

export type Handler<B, Q> = (c: Ctx<B, Q>) => Promise<unknown>;
interface Route { method: string; re: RegExp; keys: string[]; opts: RouteOptions<any, any>; handler: Handler<any, any>; pattern: string }

const JSON_LIMIT = 256 * 1024;

function compile(pattern: string): { re: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = pattern.split('/').map((seg) => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { re: new RegExp(`^${src}/?$`), keys };
}

async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError(413, 'payload_too_large', 'That request is too large.');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export class Router {
  private routes: Route[] = [];
  constructor(private s: Services) {}

  private add<B, Q>(method: string, pattern: string, opts: RouteOptions<B, Q>, handler: Handler<B, Q>) {
    const { re, keys } = compile(pattern);
    this.routes.push({ method, re, keys, opts, handler, pattern });
  }
  get<Q = unknown>(p: string, o: RouteOptions<unknown, Q>, h: Handler<unknown, Q>) { this.add('GET', p, o, h); }
  post<B = unknown, Q = unknown>(p: string, o: RouteOptions<B, Q>, h: Handler<B, Q>) { this.add('POST', p, o, h); }
  put<B = unknown, Q = unknown>(p: string, o: RouteOptions<B, Q>, h: Handler<B, Q>) { this.add('PUT', p, o, h); }
  patch<B = unknown, Q = unknown>(p: string, o: RouteOptions<B, Q>, h: Handler<B, Q>) { this.add('PATCH', p, o, h); }
  delete<B = unknown, Q = unknown>(p: string, o: RouteOptions<B, Q>, h: Handler<B, Q>) { this.add('DELETE', p, o, h); }

  /** Lists registered routes (used by tests that assert every protected route rejects anonymous callers). */
  list(): { method: string; pattern: string; auth: AuthMode }[] {
    return this.routes.map((r) => ({ method: r.method, pattern: r.pattern, auth: r.opts.auth ?? 'active' }));
  }

  /** Returns false when no route matches (so the caller can fall through to static files). */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    let matchedPath = false;
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      matchedPath = true;
      if (r.method !== req.method) continue;
      await this.run(r, m, url, req, res);
      return true;
    }
    if (matchedPath) { this.send(res, new HttpError(405, 'method_not_allowed', 'Method not allowed.')); return true; }
    return false;
  }

  private send(res: ServerResponse, out: unknown) {
    if (res.headersSent) return;
    if (out instanceof HttpError) {
      const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
      const d = out.details as { retryAfterSec?: number } | undefined;
      if (out.status === 429 && d?.retryAfterSec) headers['retry-after'] = String(d.retryAfterSec);
      res.writeHead(out.status, headers);
      res.end(JSON.stringify({ error: { code: out.code, message: out.message, ...(out.details !== undefined ? { details: out.details } : {}) } }));
      return;
    }
    const r = out instanceof Reply ? out : new Reply(out === undefined ? 204 : 200, out);
    if (r.binary) { res.writeHead(r.status, r.headers); res.end(r.binary); return; }
    if (r.status === 204 || r.body === undefined) { res.writeHead(r.status, r.headers); res.end(); return; }
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...r.headers });
    res.end(JSON.stringify(r.body));
  }

  private async run(r: Route, m: RegExpExecArray, url: URL, req: IncomingMessage, res: ServerResponse) {
    const s = this.s;
    const reqId = Math.random().toString(36).slice(2, 10);
    const log = s.log.child({ reqId });
    const started = Date.now();
    try {
      const ip = clientIp(req, s.config);
      const mode: AuthMode = r.opts.auth ?? 'active';
      let principal: Principal | null = null;
      if (mode !== 'none') {
        const authz = req.headers.authorization;
        const token = authz?.startsWith('Bearer ') ? authz.slice(7).trim() : null;
        if (!token) throw unauthorized();
        principal = await authenticate(s, token);
        if (!principal) throw unauthorized('Your session has expired. Please sign in again.', 'session_invalid');
        if (mode !== 'session') {
          if (principal.status === 'pending_eligibility') throw forbidden('Please confirm your eligibility to continue.', 'eligibility_required');
          if (principal.status === 'ineligible') throw forbidden('This account is not eligible for FREEVERSE.', 'ineligible');
          if (principal.status === 'suspended') throw forbidden('This account is suspended.', 'suspended');
          if (principal.status !== 'active') throw unauthorized();
          if (typeof mode === 'object' && !principal.permissions.has(mode.perm)) {
            log.warn('permission_denied', { perm: mode.perm, route: r.pattern });
            throw forbidden('You do not have permission to do that.', 'permission_denied');
          }
        }
      }
      if (r.opts.rate) {
        const by = r.opts.rate.by ?? (principal ? 'user' : 'ip');
        s.rate.check(`${r.opts.rate.key}:${by === 'user' && principal ? principal.userId : ip}`, r.opts.rate.limit, r.opts.rate.windowMs);
      }
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1] ?? ''); } catch { throw badRequest('Bad URL.'); } });

      let rawBody: Buffer | null = null;
      let body: unknown = undefined;
      if (r.opts.raw) rawBody = await readBody(req, r.opts.raw.maxBytes);
      else if (req.method !== 'GET' && req.method !== 'DELETE' || r.opts.body) {
        const buf = await readBody(req, JSON_LIMIT);
        if (buf.length) {
          try { body = JSON.parse(buf.toString('utf8')); } catch { throw badRequest('The request body is not valid JSON.'); }
        }
      }
      if (r.opts.body) {
        const parsed = r.opts.body.safeParse(body ?? {});
        if (!parsed.success) throw badRequest('Some details need attention.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })), 'validation_failed');
        body = parsed.data;
      }
      let query: unknown = Object.fromEntries(url.searchParams);
      if (r.opts.query) {
        const parsed = r.opts.query.safeParse(query);
        if (!parsed.success) throw badRequest('Some details need attention.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })), 'validation_failed');
        query = parsed.data;
      }

      const me = principal;
      const ctx: Ctx<any, any> = {
        s, db: s.db, log, req, res, params, query, body, rawBody, ip, principal,
        get me(): Principal { if (!me) throw unauthorized(); return me; },
        now: () => s.now(),
        header: (n) => { const v = req.headers[n.toLowerCase()]; return Array.isArray(v) ? v[0] : v; },
        can: (perm) => !!me?.permissions.has(perm),
        async requireStepUp() {
          if (!me) throw unauthorized();
          const ok = await verifyStepUp(s.db, me.userId, ctx.header('x-step-up'), s.now());
          if (!ok) throw forbidden('Please confirm it is you to do this.', 'step_up_required');
        },
      };
      const out = await r.handler(ctx);
      this.send(res, out);
      log.debug('request', { method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - started });
    } catch (e) {
      if (e instanceof HttpError) { this.send(res, e); return; }
      log.error('unhandled_error', { method: req.method, path: url.pathname, err: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 4).join(' | ') : undefined });
      this.send(res, new HttpError(500, 'internal_error', 'Something went wrong on our side. Please try again.'));
    }
  }
}
