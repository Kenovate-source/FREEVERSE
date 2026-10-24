import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, forbidden } from '../http/errors';
import { uuid } from '../db';
import { audit } from '../services/audit';
import { listErasers, listExporters, registerEraser } from '../services/erasure';
import type { Services } from '../services';

/**
 * Account lifecycle: export and deletion.
 * Deletion is assembled from per-module erasers (see services/erasure.ts) and runs in ONE transaction: it either fully
 * completes or changes nothing. What remains afterwards is listed in docs/DATA_LIFECYCLE.md and returned to the person.
 */
export const RETAINED_AFTER_DELETION = [
  'Messages you sent stay visible to the people you wrote to, under the neutral name “Deleted account”.',
  'Replies other people wrote to your comments stay readable; your own comment text is removed.',
  'Safety reports and moderation cases that involve other people are kept without your account link (closed cases lose their copied content).',
  'The audit log keeps a record that actions happened, without message or post content. It is append-only by design.',
  'Safety-flagged Nova excerpts, if any, are detached from your identity and expire on their own schedule (30 days by default).',
  'An anonymous tally that a deletion happened (counts only).',
];

export async function deleteAccount(s: Services, userId: string): Promise<{ counts: Record<string, number>; providerNote?: string }> {
  const now = s.now();
  const nowIso = now.toISOString();
  const identity = await s.db.get<{ provider: string; subject: string }>('SELECT provider, subject FROM auth_identities WHERE user_id = $1', [userId]);
  const after: (() => Promise<void>)[] = [];
  const counts: Record<string, number> = {};
  await s.db.tx(async (t) => {
    for (const [name, fn] of listErasers()) {
      const r = await fn(t, userId, { now, storage: s.storage });
      if (r?.counts) for (const [k, v] of Object.entries(r.counts)) counts[`${name}.${k}`] = v;
      if (r?.afterCommit) after.push(r.afterCommit);
    }
    // Final scrub: the users row stays as an inert tombstone so references held elsewhere resolve to "Deleted account".
    await t.run('DELETE FROM role_grants WHERE user_id = $1 AND revoked_at IS NOT NULL', [userId]);
    await t.run("UPDATE role_grants SET revoked_at = $2, revoked_reason = 'account deleted' WHERE user_id = $1 AND revoked_at IS NULL", [userId, nowIso]);
    await t.run('UPDATE governance_seats SET holder_user_id = NULL WHERE holder_user_id = $1', [userId]);
    await t.run('DELETE FROM auth_identities WHERE user_id = $1', [userId]);
    await t.run('DELETE FROM step_up_grants WHERE user_id = $1', [userId]);
    await t.run(
      `UPDATE users SET status = 'deleted', handle = NULL, display_name = NULL, birth_month = NULL, birth_year = NULL, age_check_method = NULL, age_check_status = NULL, age_attested_at = NULL,
         terms_version = NULL, terms_accepted_at = NULL, onboarding_path = NULL, onboarding_step = NULL, suspended_until = NULL, last_seen_at = NULL, deleted_at = $2, updated_at = $2 WHERE id = $1`, [userId, nowIso]);
    await t.run('INSERT INTO account_deletions (id, completed_at, summary) VALUES ($1,$2,$3)', [uuid(), nowIso, counts]);
    await audit(t, { actorId: null, action: 'account.deleted', targetType: 'user', targetId: userId, meta: { modulesErased: listErasers().length } }, now);
  });
  for (const f of after) await f().catch((e) => s.log.warn('erase_after_commit_failed', { err: String(e) }));
  let providerNote: string | undefined;
  if (identity) {
    const r = await s.auth.deleteIdentity(identity.subject).catch((e) => ({ deleted: false, note: `Provider cleanup failed: ${String(e)}` }));
    if (!r.deleted) providerNote = r.note ?? 'The sign-in provider record could not be removed automatically.';
  }
  return { counts, providerNote };
}

export const accountModule: ModuleDef = {
  name: 'account',
  register(router, s) {
    router.get('/api/account/data-summary', { auth: 'active' }, async () => ({
      exportFormat: 'JSON', retainedAfterDeletion: RETAINED_AFTER_DELETION,
      note: 'Deleting your account removes your profile, posts, comments, reactions, saved items, uploads, Nova conversations and journal, goals and habits. This cannot be undone.',
    }));

    router.get('/api/account/export', { auth: 'active', rate: { key: 'export', limit: 5, windowMs: 3600_000 } }, async (c) => {
      const out: Record<string, unknown> = { exportedAt: c.now().toISOString(), format: 'FREEVERSE data export v1' };
      for (const [name, fn] of listExporters()) out[name] = await fn(c.db, c.me.userId);
      await audit(c.db, { actorId: c.me.userId, action: 'account.exported', targetType: 'user', targetId: c.me.userId }, c.now());
      return out;
    });

    router.post('/api/account/delete', { auth: 'active', body: z.object({ confirm: z.literal('DELETE MY ACCOUNT') }).strict(), rate: { key: 'delete', limit: 3, windowMs: 3600_000 } }, async (c) => {
      await c.requireStepUp();
      if (c.me.roles.includes('founder')) throw forbidden('The Founder account cannot be deleted while it holds the Founder role. Transfer or revoke it first.', 'founder_protected');
      if (c.me.roles.some((r) => ['council', 'high_council'].includes(r))) throw conflict('Please step down from your governance seat first, so the structure is never left unclear.', 'seat_held');
      const r = await deleteAccount(s, c.me.userId);
      return { ok: true, retained: RETAINED_AFTER_DELETION, providerNote: r.providerNote ?? null };
    });
    void registerEraser;
  },
};
