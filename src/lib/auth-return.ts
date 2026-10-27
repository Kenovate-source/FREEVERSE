// Supabase redirects back to the site after email confirmation or password recovery with the result in the URL hash
// (#access_token=…&type=signup, or #error=…&error_code=otp_expired). The hash router would read that as a route, so it is
// consumed once at startup, the token is stored, and the address is replaced with a normal route.
export type AuthReturn =
  | { kind: 'session'; token: string; type: string }
  | { kind: 'error'; code: string };

export function parseAuthReturn(hash: string): AuthReturn | null {
  const raw = hash.replace(/^#\/?/, '');
  if (!/(^|&)(access_token|error|error_code)=/.test(raw)) return null;
  const p = new URLSearchParams(raw);
  const token = p.get('access_token');
  if (token) return { kind: 'session', token, type: p.get('type') ?? 'signup' };
  if (p.get('error') || p.get('error_code')) return { kind: 'error', code: p.get('error_code') ?? p.get('error') ?? 'error' };
  return null;
}

/** Where to send the person once the return has been consumed. */
export function authReturnRoute(r: AuthReturn): string {
  if (r.kind === 'error') return `/signin?notice=${r.code === 'otp_expired' ? 'link_expired' : 'link_invalid'}`;
  return r.type === 'recovery' ? '/reset-password' : '/home';
}
