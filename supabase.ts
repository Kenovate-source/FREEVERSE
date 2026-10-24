import { createHash } from 'node:crypto';
import { type AuthProvider, AuthProviderError, type ProviderIdentity, type ProviderSession } from './types';

export interface SupabaseAuthOptions {
  url: string;
  anonKey: string;
  /** Server-side only. Needed solely to delete a user at the provider during account deletion. Never sent to the browser. */
  serviceRoleKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface GoTrueUser { id: string; email?: string; email_confirmed_at?: string | null; confirmed_at?: string | null }
interface GoTrueSession { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: GoTrueUser }

/**
 * Supabase Auth (GoTrue) over its documented REST API. The browser never talks to Supabase: it calls our /api/auth/*
 * endpoints, which call these methods, so no Supabase key is shipped to the client. NOT verified against a live
 * project in this repository (no credentials were available); it is covered by tests against a fake GoTrue server.
 */
export function createSupabaseAuth(o: SupabaseAuthOptions): AuthProvider {
  const f = o.fetchImpl ?? fetch;
  const now = o.now ?? (() => Date.now());
  const base = `${o.url.replace(/\/+$/, '')}/auth/v1`;
  const cache = new Map<string, { until: number; id: ProviderIdentity }>();
  const h = (t: string) => createHash('sha256').update(t).digest('hex');

  async function call(path: string, init: { method?: string; body?: unknown; bearer?: string; useServiceKey?: boolean } = {}): Promise<{ status: number; json: any }> {
    const key = init.useServiceKey ? o.serviceRoleKey! : o.anonKey;
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method: init.method ?? 'GET',
        headers: { apikey: key, 'content-type': 'application/json', ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : init.useServiceKey ? { authorization: `Bearer ${key}` } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 8000),
      });
    } catch {
      throw new AuthProviderError(503, 'provider_unavailable', 'The sign-in service could not be reached. Please try again shortly.');
    }
    let json: any = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, json };
  }

  const toIdentity = (u: GoTrueUser): ProviderIdentity => ({ provider: 'supabase', subject: u.id, email: u.email?.toLowerCase() ?? null, emailVerified: !!(u.email_confirmed_at || u.confirmed_at) });
  const toSession = (s: GoTrueSession): ProviderSession => ({
    accessToken: s.access_token, refreshToken: s.refresh_token,
    expiresAt: s.expires_at ? new Date(s.expires_at * 1000).toISOString() : s.expires_in ? new Date(now() + s.expires_in * 1000).toISOString() : undefined,
  });
  function mapError(status: number, json: any): AuthProviderError {
    const code = String(json?.error_code ?? json?.code ?? json?.error ?? '');
    const msg = String(json?.msg ?? json?.message ?? json?.error_description ?? '');
    if (status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return new AuthProviderError(429, 'rate_limited', 'Too many attempts. Please wait a little and try again.');
    if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return new AuthProviderError(400, 'invalid_credentials', 'That email and password do not match an account.');
    if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) return new AuthProviderError(400, 'email_not_confirmed', 'Please confirm your email address first. Check your inbox for the link.');
    if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) return new AuthProviderError(409, 'already_registered', 'An account with this email already exists. Try signing in.');
    if (code === 'weak_password' || /password/i.test(msg) && status === 422) return new AuthProviderError(422, 'weak_password', 'That password is too weak. Use a longer, less guessable one.');
    if (status >= 500) return new AuthProviderError(503, 'provider_unavailable', 'The sign-in service had a problem. Please try again shortly.');
    return new AuthProviderError(400, 'invalid_request', 'The request could not be completed.');
  }

  return {
    kind: 'supabase',
    managed: true,
    async signUp(email, password, opts) {
      const q = opts?.redirectTo ? `?redirect_to=${encodeURIComponent(opts.redirectTo)}` : '';
      const r = await call(`/signup${q}`, { method: 'POST', body: { email, password } });
      if (r.status >= 400) throw mapError(r.status, r.json);
      // Email confirmation ON: the response is the user, with no access_token. OFF: it is a session.
      if (r.json?.access_token) {
        const user = r.json.user as GoTrueUser;
        return { identity: toIdentity(user), session: toSession(r.json), needsEmailConfirmation: false };
      }
      const user: GoTrueUser = r.json?.user ?? r.json;
      return { identity: toIdentity(user), needsEmailConfirmation: true };
    },
    async signIn(email, password) {
      const r = await call('/token?grant_type=password', { method: 'POST', body: { email, password } });
      if (r.status >= 400 || !r.json?.access_token) throw mapError(r.status, r.json);
      return { identity: toIdentity(r.json.user), session: toSession(r.json) };
    },
    async signOut(token) {
      cache.delete(h(token));
      await call('/logout', { method: 'POST', bearer: token }); // best effort
    },
    async recover(email, opts) {
      const q = opts?.redirectTo ? `?redirect_to=${encodeURIComponent(opts.redirectTo)}` : '';
      const r = await call(`/recover${q}`, { method: 'POST', body: { email } });
      if (r.status === 429) throw mapError(r.status, r.json);
      // Deliberately ignore other outcomes so the response never reveals whether an email is registered.
    },
    async updatePassword(token, newPassword) {
      const r = await call('/user', { method: 'PUT', bearer: token, body: { password: newPassword } });
      if (r.status >= 400) throw mapError(r.status, r.json);
    },
    async verifyToken(token) {
      const k = h(token);
      const hit = cache.get(k);
      if (hit && hit.until > now()) return hit.id;
      const r = await call('/user', { bearer: token });
      if (r.status === 401 || r.status === 403 || r.status === 404) { cache.delete(k); return null; }
      if (r.status >= 400 || !r.json?.id) throw new AuthProviderError(503, 'provider_unavailable', 'The sign-in service could not verify your session.');
      const id = toIdentity(r.json);
      cache.set(k, { until: now() + 30_000, id });
      return id;
    },
    async verifyPassword(email, password) {
      const r = await call('/token?grant_type=password', { method: 'POST', body: { email, password } });
      return r.status < 400 && !!r.json?.access_token;
    },
    async deleteIdentity(subject) {
      if (!o.serviceRoleKey) return { deleted: false, note: 'SUPABASE_SERVICE_ROLE_KEY is not configured, so the login at the provider was not removed. The FREEVERSE account is deleted and its sessions are rejected.' };
      const r = await call(`/admin/users/${encodeURIComponent(subject)}`, { method: 'DELETE', useServiceKey: true });
      if (r.status >= 400 && r.status !== 404) return { deleted: false, note: 'The provider refused to delete the login; retry from the Supabase dashboard.' };
      return { deleted: true };
    },
    describe: () => ({ kind: 'supabase', managed: true, note: 'Managed authentication via Supabase Auth. Not verified against a live project in this build.' }),
  };
}
