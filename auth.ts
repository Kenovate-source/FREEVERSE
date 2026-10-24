import { z } from 'zod';
import type { ModuleDef } from './types';
import { Router } from '../http/router';
import { HttpError, badRequest, forbidden } from '../http/errors';
import { AuthProviderError } from '../auth/types';
import { checkEligibility, ageBand } from '../domain/eligibility';
import { audit } from '../services/audit';
import { createStepUp } from '../authz/step-up';
import { json, uuid } from '../db';
import { randomBytes } from 'node:crypto';
import { LEGAL_STATUS, LEGAL_VERSION, MAX_AGE, MIN_AGE, TERMS_VERSION } from '../../shared/constants';
import { LEGAL_DOC_IDS } from '../../shared/legal';
import { loadPrincipal } from '../authz/principal';
import { publicConfigSummary } from '../config';
import type { Services } from '../services';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(8, 'Use at least 8 characters.').max(200);

function providerCall<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((e) => {
    if (e instanceof AuthProviderError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  });
}

function defaultAvatarConfig() {
  return { seed: randomBytes(6).toString('hex') };
}

export async function meView(s: Services, userId: string) {
  const p = await loadPrincipal(s.db, userId);
  if (!p) return null;
  const u = await s.db.get<Record<string, unknown>>(
    `SELECT birth_month, birth_year, age_check_method, age_check_status, age_attested_at, onboarding_path, onboarding_step, onboarding_completed_at, terms_version, created_at, eligibility_exemption FROM users WHERE id = $1`, [userId]);
  const band = u && u.birth_month && u.birth_year ? ageBand(Number(u.birth_month), Number(u.birth_year), s.now()) : null;
  return {
    user: {
      id: p.userId, status: p.status, handle: p.handle, displayName: p.displayName, email: p.email,
      roles: p.roles, permissions: [...p.permissions].sort(), seatLevel: p.seatLevel,
      createdAt: u?.created_at ?? null,
      onboarding: { completed: p.onboardingCompleted, path: u?.onboarding_path ?? null, step: u?.onboarding_step ?? null },
      // Birth data is never returned. The person sees only the method/status of the check and a coarse band.
      eligibility: { status: u?.age_check_status ?? null, method: u?.age_check_method ?? null, attestedAt: u?.age_attested_at ?? null, ageBand: band, exemption: u?.eligibility_exemption ?? null },
    },
    auth: s.auth.describe(),
  };
}

export const authModule: ModuleDef = {
  name: 'auth',
  register(router: Router, s) {
    router.get('/api/config', { auth: 'none' }, async () => ({
      app: { name: 'FREEVERSE', stage: 2 },
      auth: s.auth.describe(),
      eligibility: { min: MIN_AGE, max: MAX_AGE, method: 'self_declared_birthdate', verified: false },
      terms: { version: TERMS_VERSION },
      legal: { version: LEGAL_VERSION, status: LEGAL_STATUS, documents: LEGAL_DOC_IDS },
      features: { ...publicConfigSummary(s.config), anonymousPosting: s.config.anonymousPostingEnabled },
    }));

    router.post('/api/auth/signup', {
      auth: 'none',
      rate: { key: 'auth:signup', limit: 10, windowMs: 60 * 60_000, by: 'ip' },
      body: z.object({ email, password, confirmAgeRange: z.literal(true, { message: 'Please confirm you are an adult aged 18–24.' }) }),
    }, async (c) => {
      const r = await providerCall(() => s.auth.signUp(c.body.email, c.body.password, { redirectTo: s.config.publicOrigin }));
      return { needsEmailConfirmation: r.needsEmailConfirmation, session: r.session ?? null, authProvider: s.auth.kind };
    });

    router.post('/api/auth/signin', {
      auth: 'none',
      rate: { key: 'auth:signin', limit: 20, windowMs: 10 * 60_000, by: 'ip' },
      body: z.object({ email, password: z.string().min(1).max(200) }),
    }, async (c) => {
      const r = await providerCall(() => s.auth.signIn(c.body.email, c.body.password));
      return { session: r.session };
    });

    router.post('/api/auth/signout', { auth: 'session' }, async (c) => {
      const token = c.header('authorization')?.slice(7).trim() ?? '';
      await providerCall(() => s.auth.signOut(token));
      return { ok: true };
    });

    router.post('/api/auth/recover', {
      auth: 'none',
      rate: { key: 'auth:recover', limit: 5, windowMs: 60 * 60_000, by: 'ip' },
      body: z.object({ email }),
    }, async (c) => {
      await providerCall(() => s.auth.recover(c.body.email, { redirectTo: s.config.publicOrigin }));
      return { ok: true, message: 'If an account exists for that email, a reset link is on its way.' };
    });

    router.post('/api/auth/password', { auth: 'session', rate: { key: 'auth:password', limit: 5, windowMs: 10 * 60_000 }, body: z.object({ newPassword: password }) }, async (c) => {
      const token = c.header('authorization')?.slice(7).trim() ?? '';
      await providerCall(() => s.auth.updatePassword(token, c.body.newPassword));
      await audit(c.db, { actorId: c.me.userId, action: 'auth.password_changed', targetType: 'user', targetId: c.me.userId }, c.now());
      return { ok: true };
    });

    router.get('/api/me', { auth: 'session' }, async (c) => {
      const v = await meView(s, c.me.userId);
      if (!v) throw forbidden();
      return v;
    });

    // Eligibility gate. Server-side: the browser's checkbox is not trusted. Only month and year are kept.
    router.post('/api/me/eligibility', {
      auth: 'session',
      rate: { key: 'eligibility', limit: 10, windowMs: 60 * 60_000, by: 'ip' },
      body: z.object({
        birthMonth: z.number().int().min(1).max(12),
        birthDay: z.number().int().min(1).max(31),
        birthYear: z.number().int().min(1900).max(2100),
        acceptTerms: z.literal(true, { message: 'You need to accept the terms to continue.' }),
        confirmSelfDeclared: z.literal(true, { message: 'Please confirm the date you entered is correct.' }),
      }),
    }, async (c) => {
      const me = c.me;
      if (me.status === 'ineligible') throw forbidden('FREEVERSE is for adults aged 18–24 right now.', 'ineligible');
      if (me.status !== 'pending_eligibility') throw new HttpError(409, 'already_active', 'Your eligibility has already been confirmed.');
      const u = await c.db.get<{ eligibility_exemption: string | null }>('SELECT eligibility_exemption FROM users WHERE id = $1', [me.userId]);
      const res = checkEligibility({ month: c.body.birthMonth, day: c.body.birthDay, year: c.body.birthYear }, c.now(), { skipMax: u?.eligibility_exemption === 'founder' });
      if (!res.eligible && res.reason === 'invalid_date') throw badRequest('That date is not valid. Please check it.', undefined, 'invalid_date');
      if (!res.eligible) {
        // Deliberately the same message for too young and too old; nothing about the date is stored.
        await c.db.run("UPDATE users SET status = 'ineligible', eligibility_attempts = eligibility_attempts + 1, updated_at = $2 WHERE id = $1", [me.userId, c.now().toISOString()]);
        await audit(c.db, { actorId: me.userId, action: 'account.ineligible', targetType: 'user', targetId: me.userId, meta: { method: 'self_declared_birthdate' } }, c.now());
        throw forbidden('FREEVERSE is for adults aged 18–24 right now. We have not saved the date you entered.', 'ineligible');
      }
      const nowIso = c.now().toISOString();
      const handle = `member-${randomBytes(4).toString('hex')}`;
      await c.db.tx(async (t) => {
        await t.run(
          `UPDATE users SET status = 'active', birth_month = $2, birth_year = $3, age_check_method = 'self_declared_birthdate', age_check_status = 'self_attested',
             age_attested_at = $4, terms_version = $5, terms_accepted_at = $4, handle = $6, display_name = $7, eligibility_attempts = eligibility_attempts + 1, updated_at = $4
           WHERE id = $1 AND status = 'pending_eligibility'`,
          [me.userId, c.body.birthMonth, c.body.birthYear, nowIso, TERMS_VERSION, handle, 'New member']);
        for (const doc of LEGAL_DOC_IDS) {
          await t.run('INSERT INTO legal_acceptances (id, user_id, document, version, accepted_at) VALUES ($1,$2,$3,$4,$5)', [uuid(), me.userId, doc, LEGAL_VERSION, nowIso]);
        }
        await t.run('INSERT INTO profiles (user_id, avatar_config, created_at, updated_at) VALUES ($1,$2,$3,$3)', [me.userId, defaultAvatarConfig(), nowIso]);
        await t.run('INSERT INTO user_privacy (user_id, updated_at) VALUES ($1,$2)', [me.userId, nowIso]);
        await t.run('INSERT INTO user_settings (user_id, updated_at) VALUES ($1,$2)', [me.userId, nowIso]);
        // The exact day is intentionally not in this audit record or anywhere else.
        await audit(t, { actorId: me.userId, action: 'account.eligibility_self_attested', targetType: 'user', targetId: me.userId, meta: { method: 'self_declared_birthdate', verified: false, termsVersion: TERMS_VERSION } }, c.now());
      });
      return await meView(s, me.userId);
    });

    // Re-authentication for sensitive actions.
    router.post('/api/me/step-up', {
      auth: 'active',
      rate: { key: 'stepup', limit: 10, windowMs: 10 * 60_000 },
      body: z.object({ secret: z.string().min(1).max(200) }),
    }, async (c) => {
      const me = c.me;
      if (!me.email) throw forbidden();
      const ok = await providerCall(() => s.auth.verifyPassword(me.email!, c.body.secret));
      if (!ok) {
        await audit(c.db, { actorId: me.userId, action: 'auth.step_up', outcome: 'denied' }, c.now());
        throw forbidden(s.auth.kind === 'dev' ? 'Type your account email to confirm.' : 'That password is not correct.', 'step_up_failed');
      }
      const g = await createStepUp(c.db, me.userId, c.now());
      await audit(c.db, { actorId: me.userId, actorRole: me.roles[0] ?? null, action: 'auth.step_up', outcome: 'success' }, c.now());
      return { token: g.token, expiresAt: g.expiresAt, how: s.auth.kind === 'dev' ? 'email_confirmation' : 'password' };
    });
  },
};
void json; void uuid;
