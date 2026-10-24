import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { uuid } from '../db';
import { type AuthProvider, AuthProviderError, type ProviderIdentity } from './types';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * LOCAL DEVELOPMENT ONLY. Identifies a person by email and issues an opaque session token. It does NOT verify
 * passwords (none are stored), so anyone who knows an email can sign in as it. loadConfig() refuses to start it in
 * production or on a non-loopback address. It exists so the product can run and be tested with no external account.
 */
export function createDevAuth(db: Db, now: () => Date = () => new Date()): AuthProvider {
  const ident = (subject: string, email: string): ProviderIdentity => ({ provider: 'dev', subject, email, emailVerified: true });
  async function issue(subject: string) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(now().getTime() + SESSION_MS).toISOString();
    await db.run('INSERT INTO dev_sessions (token_hash, subject, created_at, expires_at) VALUES ($1,$2,$3,$4)', [hash(token), subject, now().toISOString(), expires]);
    return { accessToken: token, expiresAt: expires };
  }
  return {
    kind: 'dev',
    managed: false,
    async signUp(email, password) {
      if (password.length < 8) throw new AuthProviderError(422, 'weak_password', 'Use at least 8 characters.');
      const e = email.trim().toLowerCase();
      if (await db.get('SELECT 1 AS x FROM dev_accounts WHERE email = $1', [e])) throw new AuthProviderError(409, 'already_registered', 'An account with this email already exists. Try signing in.');
      const subject = uuid();
      await db.run('INSERT INTO dev_accounts (subject, email, created_at) VALUES ($1,$2,$3)', [subject, e, now().toISOString()]);
      return { identity: ident(subject, e), session: await issue(subject), needsEmailConfirmation: false };
    },
    async signIn(email, password) {
      const e = email.trim().toLowerCase();
      const row = await db.get<{ subject: string }>('SELECT subject FROM dev_accounts WHERE email = $1', [e]);
      if (!row || !password) throw new AuthProviderError(400, 'invalid_credentials', 'That email and password do not match an account.');
      return { identity: ident(row.subject, e), session: await issue(row.subject) };
    },
    async signOut(token) { await db.run('DELETE FROM dev_sessions WHERE token_hash = $1', [hash(token)]); },
    async recover() { throw new AuthProviderError(501, 'not_supported', 'Password recovery is not available in local development mode (there are no passwords). It works with the managed provider.'); },
    async updatePassword() { throw new AuthProviderError(501, 'not_supported', 'Passwords are not used in local development mode.'); },
    async verifyToken(token) {
      const row = await db.get<{ subject: string; email: string }>(
        `SELECT s.subject, a.email FROM dev_sessions s JOIN dev_accounts a ON a.subject = s.subject WHERE s.token_hash = $1 AND s.expires_at > $2`, [hash(token), now().toISOString()]);
      return row ? ident(row.subject, row.email) : null;
    },
    async verifyPassword(email, secret) {
      // Step-up in dev mode: there is no password to check, so the confirmation phrase is the account's own email address.
      const e = email.trim().toLowerCase();
      return secret.trim().toLowerCase() === e && !!(await db.get('SELECT 1 AS x FROM dev_accounts WHERE email = $1', [e]));
    },
    async deleteIdentity(subject) {
      await db.run('DELETE FROM dev_accounts WHERE subject = $1', [subject]);
      return { deleted: true };
    },
    describe: () => ({ kind: 'dev', managed: false, note: 'Local development sign-in. Passwords are not checked. Never use in production.' }),
  };
}
