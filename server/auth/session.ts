import type { Services } from '../services';
import { uuid } from '../db';
import { loadPrincipal, type Principal } from '../authz/principal';
import { audit } from '../services/audit';
import { AuthProviderError, type ProviderIdentity } from './types';
import { HttpError } from '../http/errors';

/** Finds the FREEVERSE user for a provider identity, creating a pending account the first time it is seen. */
export async function resolveUser(s: Services, id: ProviderIdentity): Promise<string> {
  const existing = await s.db.get<{ user_id: string }>('SELECT user_id FROM auth_identities WHERE provider = $1 AND subject = $2', [id.provider, id.subject]);
  if (existing) {
    await s.db.run('UPDATE auth_identities SET email = $1, email_verified = $2, last_sign_in_at = $3 WHERE provider = $4 AND subject = $5',
      [id.email, id.emailVerified, s.now().toISOString(), id.provider, id.subject]);
    return existing.user_id;
  }
  const userId = uuid();
  const nowIso = s.now().toISOString();
  await s.db.tx(async (t) => {
    await t.run('INSERT INTO users (id, status, created_at, updated_at) VALUES ($1, $2, $3, $3)', [userId, 'pending_eligibility', nowIso]);
    await t.run('INSERT INTO auth_identities (id, user_id, provider, subject, email, email_verified, created_at, last_sign_in_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
      [uuid(), userId, id.provider, id.subject, id.email, id.emailVerified, nowIso]);
  });
  return userId;
}

/** The first verified sign-in with FOUNDER_EMAIL becomes the Founder (one only; enforced by a unique index). */
async function maybeBootstrapFounder(s: Services, userId: string, id: ProviderIdentity): Promise<void> {
  const fe = s.config.founderEmail;
  if (!fe || !id.email || id.email !== fe || !id.emailVerified) return;
  const has = await s.db.get('SELECT 1 AS x FROM role_grants WHERE role = $1 AND revoked_at IS NULL', ['founder']);
  if (has) return;
  const nowIso = s.now().toISOString();
  try {
    await s.db.tx(async (t) => {
      const seat = await t.get<{ id: string }>('SELECT id FROM governance_seats WHERE level = 1 AND seat_no = 1');
      await t.run('INSERT INTO role_grants (id, user_id, role, seat_id, granted_at, reason) VALUES ($1,$2,$3,$4,$5,$6)', [uuid(), userId, 'founder', seat?.id ?? null, nowIso, 'Bootstrap from FOUNDER_EMAIL']);
      if (seat) await t.run('UPDATE governance_seats SET holder_user_id = $1, appointed_at = $2, updated_at = $2 WHERE id = $3', [userId, nowIso, seat.id]);
      await audit(t, { actorId: userId, actorRole: 'founder', action: 'governance.founder_bootstrap', targetType: 'user', targetId: userId, reason: 'First verified sign-in with the configured FOUNDER_EMAIL' }, s.now());
    });
  } catch (e) {
    s.log.warn('founder_bootstrap_skipped', { err: e instanceof Error ? e.message : String(e) }); // unique index lost a race
  }
}

/** Verifies a bearer token with the auth provider and returns the principal, or null when invalid. */
export async function authenticate(s: Services, token: string): Promise<Principal | null> {
  let identity: ProviderIdentity | null;
  try { identity = await s.auth.verifyToken(token); }
  catch (e) {
    if (e instanceof AuthProviderError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  }
  if (!identity) return null;
  const userId = await resolveUser(s, identity);
  await maybeBootstrapFounder(s, userId, identity);
  let p = await loadPrincipal(s.db, userId);
  if (!p || p.status === 'deleted') return null;
  if (p.status === 'suspended') {
    const u = await s.db.get<{ suspended_until: string | null }>('SELECT suspended_until FROM users WHERE id = $1', [userId]);
    if (u?.suspended_until && new Date(u.suspended_until).getTime() <= s.now().getTime()) {
      await s.db.run("UPDATE users SET status = 'active', suspended_until = NULL, updated_at = $2 WHERE id = $1", [userId, s.now().toISOString()]);
      p = await loadPrincipal(s.db, userId);
    }
  }
  if (p) await s.db.run('UPDATE users SET last_seen_at = $2 WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < $3)', [userId, s.now().toISOString(), new Date(s.now().getTime() - 5 * 60_000).toISOString()]);
  return p;
}
