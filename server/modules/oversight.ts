import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound } from '../http/errors';
import { audit } from '../services/audit';
import { notify } from '../services/notify';
import { json } from '../db';

const id = z.string().uuid();
const reason = z.string().trim().min(10, 'Write a reason of at least 10 characters. It is recorded.').max(400);

/**
 * Two things the Founder needs and the model lacked:
 *  - holding a position is not the same as having access: a grant can be RESTRICTED (access paused, appointment kept) and later RESTORED;
 *  - a community can be restricted (posting limited to moderators, hidden from discovery), closed, and restored, each with a recorded reason.
 * Every change is audited and reversible. The Founder grant itself can never be restricted here.
 */
export const oversightModule: ModuleDef = {
  name: 'oversight',
  register(router) {
    router.get('/api/founder/appointments', { auth: { perm: 'governance.manage' } }, async (c) => {
      const rows = await c.db.query<any>(
        `SELECT g.id, g.role, g.seat_id, g.granted_at, g.reason, g.revoked_at, g.revoked_reason, g.restricted_at, g.restricted_reason, u.handle, u.display_name, gb.handle AS by_handle, s.title AS seat_title
           FROM role_grants g JOIN users u ON u.id = g.user_id LEFT JOIN users gb ON gb.id = g.granted_by LEFT JOIN governance_seats s ON s.id = g.seat_id
          ORDER BY (g.revoked_at IS NOT NULL), g.granted_at DESC LIMIT 200`);
      const view = (r: any) => ({ id: r.id, role: r.role, seatTitle: r.seat_title ?? null, holder: { handle: r.handle, displayName: r.display_name }, grantedAt: r.granted_at, grantedBy: r.by_handle ?? null, reason: r.reason ?? null,
        state: r.revoked_at ? 'removed' : r.restricted_at ? 'restricted' : 'active', restrictedReason: r.restricted_reason ?? null, removedReason: r.revoked_reason ?? null });
      const events = await c.db.query<any>("SELECT a.occurred_at, a.action, a.reason, a.target_id, u.handle FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id WHERE a.action IN ('governance.grant_restricted','governance.grant_restored') ORDER BY a.occurred_at DESC LIMIT 30");
      return { items: rows.map(view), history: events.map((e) => ({ at: e.occurred_at, action: e.action === 'governance.grant_restricted' ? 'Access restricted' : 'Access restored', reason: e.reason ?? null, grantId: e.target_id, by: e.handle ?? null })),
        note: 'Holding a position and having access are separate. Restricting pauses what a role can do and keeps the appointment; removing ends it. Both need a reason and are recorded.' };
    });

    for (const kind of ['restrict', 'restore'] as const) {
      router.post(`/api/founder/appointments/:id/${kind}`, { auth: { perm: 'governance.manage' }, body: z.object({ reason }).strict() }, async (c) => {
        const g = await c.db.get<any>('SELECT * FROM role_grants WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
        if (!g || g.revoked_at) throw notFound('We couldn’t find that live appointment.');
        if (g.role === 'founder') throw conflict('The Founder’s own access can’t be restricted here.', 'founder_protected');
        if (kind === 'restrict' && g.restricted_at) throw conflict('Access is already restricted.', 'already_restricted');
        if (kind === 'restore' && !g.restricted_at) throw conflict('Access is not restricted.', 'not_restricted');
        const now = c.now().toISOString();
        if (kind === 'restrict') await c.db.run('UPDATE role_grants SET restricted_at = $2, restricted_by = $3, restricted_reason = $4 WHERE id = $1', [g.id, now, c.me.userId, c.body.reason]);
        else await c.db.run('UPDATE role_grants SET restricted_at = NULL, restricted_by = NULL, restricted_reason = NULL WHERE id = $1', [g.id]);
        await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: kind === 'restrict' ? 'governance.grant_restricted' : 'governance.grant_restored', targetType: 'role_grant', targetId: g.id, reason: c.body.reason, meta: { role: g.role, userId: g.user_id } }, c.now());
        await notify(c.db, { userId: g.user_id, type: 'system', data: { text: kind === 'restrict' ? 'Your leadership access has been paused. You still hold your appointment. See Governance for what this means.' : 'Your leadership access has been restored.' } }, c.now());
        return { ok: true, state: kind === 'restrict' ? 'restricted' : 'active' };
      });
    }

    // ───────── community oversight ─────────
    router.post('/api/founder/communities/:slug/oversight', { auth: { perm: 'config.manage' }, body: z.object({ action: z.enum(['restrict', 'unrestrict', 'close', 'reopen']), reason }).strict() }, async (c) => {
      const com = await c.db.get<any>('SELECT * FROM communities WHERE slug = $1', [String(c.params.slug)]);
      if (!com) throw notFound('We couldn’t find that community.');
      const now = c.now().toISOString(); const a = c.body.action;
      if (a === 'restrict') {
        if (com.restricted_at) throw conflict('This community is already restricted.', 'already_restricted');
        await c.db.run('UPDATE communities SET restricted_at = $2, restricted_by = $3, restricted_reason = $4, restricted_prev = $5, post_policy = $6, comment_policy = $6, discoverable = $7 WHERE id = $1',
          [com.id, now, c.me.userId, c.body.reason, { postPolicy: com.post_policy, commentPolicy: com.comment_policy, discoverable: com.discoverable === true || com.discoverable === 1 }, 'moderators', false]);
      } else if (a === 'unrestrict') {
        if (!com.restricted_at) throw conflict('This community isn’t restricted.', 'not_restricted');
        const prev = json<{ postPolicy: string; commentPolicy: string; discoverable: boolean }>(com.restricted_prev, { postPolicy: 'members', commentPolicy: 'members', discoverable: true });
        await c.db.run('UPDATE communities SET restricted_at = NULL, restricted_by = NULL, restricted_reason = NULL, restricted_prev = NULL, post_policy = $2, comment_policy = $3, discoverable = $4 WHERE id = $1', [com.id, prev.postPolicy, prev.commentPolicy, prev.discoverable]);
      } else if (a === 'close') {
        if (com.status !== 'active') throw conflict('This community is already closed.', 'already_closed');
        await c.db.run("UPDATE communities SET status = 'archived' WHERE id = $1", [com.id]);
      } else {
        if (com.status === 'active') throw conflict('This community is already open.', 'already_open');
        await c.db.run("UPDATE communities SET status = 'active' WHERE id = $1", [com.id]);
      }
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: `community.oversight_${a}`, targetType: 'community', targetId: com.id, reason: c.body.reason, meta: { slug: com.slug } }, c.now());
      return { ok: true, action: a };
    });
  },
};
