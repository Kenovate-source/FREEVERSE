import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { json, uuid } from '../db';
import { audit } from '../services/audit';
import { notify } from '../services/notify';
import { getAnonymousAuthor } from '../content/anonymity';
import { registerEraser, registerExporter } from '../services/erasure';
import type { Ctx } from '../http/router';
import type { Db } from '../db';

/**
 * Moderation — least privilege by construction:
 *  - the queue and case metadata never contain reported content or author identity;
 *  - reading the frozen snapshot needs `moderation.case.review_content`, a written reason, and writes an audit event;
 *  - revealing an anonymous author needs `moderation.reveal_anonymous` (not held by the Founder by default), a reason, step-up, and is audited;
 *  - nothing here can read private messages, Nova conversations or journals. A reported message carries only the one reported message.
 */
const id = z.string().uuid();
const reason = z.string().trim().min(10, 'Write a short reason (at least 10 characters).').max(500);

const ACTIONS = ['dismiss', 'remove_content', 'warn', 'suspend', 'send_resources', 'reveal_author', 'escalate', 'resolve'] as const;

const caseMeta = (r: any) => ({
  id: r.id, status: r.status, priority: r.priority, category: r.category, targetType: r.target_type, createdAt: r.created_at, dueAt: r.due_at,
  assignedToMe: false, assigned: !!r.assigned_to, reportCount: Number(r.report_count ?? 0), resolution: r.resolution ?? null,
});

async function loadCase(db: Db, caseId: string) {
  const r = await db.get<any>('SELECT c.*, (SELECT COUNT(*) FROM reports x WHERE x.case_id = c.id) AS report_count FROM moderation_cases c WHERE c.id = $1', [caseId]);
  if (!r) throw notFound('Case not found.');
  return r;
}

const roleLabel = (c: Ctx<any, any>) => c.me.roles.includes('moderator') ? 'moderator' : c.me.roles[0] ?? 'member';

export const moderationModule: ModuleDef = {
  name: 'moderation',
  register(router, s) {
    router.get('/api/moderation/queue', { auth: { perm: 'moderation.queue.view' }, query: z.object({ status: z.enum(['open', 'in_review', 'resolved', 'dismissed', 'active']).default('active') }) }, async (c) => {
      const w = c.query.status === 'active' ? "c.status IN ('open','in_review')" : 'c.status = $1';
      const rows = await c.db.query<any>(
        `SELECT c.id, c.status, c.priority, c.category, c.target_type, c.created_at, c.due_at, c.assigned_to, c.resolution,
                (SELECT COUNT(*) FROM reports x WHERE x.case_id = c.id) AS report_count
           FROM moderation_cases c WHERE ${w}
          ORDER BY CASE c.priority WHEN 'crisis' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, c.created_at LIMIT 200`, c.query.status === 'active' ? [] : [c.query.status]);
      await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: 'moderation.queue_viewed', meta: { status: c.query.status } }, c.now());
      return { items: rows.map((r) => ({ ...caseMeta(r), assignedToMe: r.assigned_to === c.me.userId })), note: 'Target response times are internal goals, not guarantees. This queue shows no content or identities.' };
    });

    router.get('/api/moderation/cases/:id', { auth: { perm: 'moderation.queue.view' } }, async (c) => {
      const r = await loadCase(c.db, id.parse(c.params.id));
      const actions = await c.db.query<any>('SELECT id, action, created_at, note FROM moderation_actions WHERE case_id = $1 ORDER BY created_at', [r.id]);
      return { case: { ...caseMeta(r), assignedToMe: r.assigned_to === c.me.userId, resolutionNote: r.resolution_note ?? null }, actions: actions.map((a) => ({ id: a.id, action: a.action, at: a.created_at, note: a.note })), contentAvailable: c.can('moderation.case.review_content') };
    });

    // Oversight of anonymous-author reveals. Shows who revealed, on which case, why, and whether another person has reviewed it.
    // It never shows the revealed identity: oversight judges whether the reveal was justified, not who the author was.
    router.get('/api/moderation/reveals', { auth: { perm: 'audit.view' } }, async (c) => {
      const rows = await c.db.query<any>(
        `SELECT a.id, a.occurred_at, a.case_id, a.reason, a.target_type, u.handle, u.display_name, mc.category,
                (SELECT r.reason FROM audit_events r WHERE r.action = 'moderation.reveal_reviewed' AND r.target_id = CAST(a.id AS TEXT) LIMIT 1) AS review_note,
                (SELECT r.meta FROM audit_events r WHERE r.action = 'moderation.reveal_reviewed' AND r.target_id = CAST(a.id AS TEXT) LIMIT 1) AS review_meta
           FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN moderation_cases mc ON mc.id = a.case_id
          WHERE a.action = 'moderation.anonymous_author_revealed' ORDER BY a.occurred_at DESC LIMIT 100`);
      const denied = await c.db.get<{ n: number | string }>("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'moderation.reveal_denied'");
      return {
        items: rows.map((r) => ({ id: r.id, at: r.occurred_at, caseId: r.case_id, category: r.category ?? null, targetType: r.target_type, moderator: r.handle ? { handle: r.handle, displayName: r.display_name } : null, reason: r.reason, review: r.review_note ? { note: r.review_note, outcome: json<{ outcome?: string }>(r.review_meta, {}).outcome ?? 'appropriate' } : null })),
        deniedAttempts: Number(denied?.n ?? 0),
        note: 'Reveals need a live case, a prior recorded look at the material, a written reason and re-authentication. Each is reviewed here by someone other than the moderator who made it.',
      };
    });
    router.post('/api/moderation/reveals/:id/review', { auth: { perm: 'audit.view' }, body: z.object({ outcome: z.enum(['appropriate', 'concern']), note: reason }).strict(), rate: { key: 'mod:reveal-review', limit: 60, windowMs: 3600_000 } }, async (c) => {
      const ev = await c.db.get<any>("SELECT id, actor_id FROM audit_events WHERE id = $1 AND action = 'moderation.anonymous_author_revealed'", [id.parse(c.params.id)]);
      if (!ev) throw notFound('Reveal not found.');
      if (ev.actor_id === c.me.userId) throw forbidden('You made this reveal, so someone else must review it.', 'conflict_of_interest');
      if (await c.db.get("SELECT 1 AS x FROM audit_events WHERE action = 'moderation.reveal_reviewed' AND target_id = $1", [ev.id])) throw conflict('This reveal has already been reviewed.', 'already_reviewed');
      await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: 'moderation.reveal_reviewed', targetType: 'audit_event', targetId: ev.id, reason: c.body.note, meta: { outcome: c.body.outcome } }, c.now());
      return { ok: true };
    });

    router.post('/api/moderation/cases/:id/assign', { auth: { perm: 'moderation.case.act' } }, async (c) => {
      const r = await loadCase(c.db, id.parse(c.params.id));
      if (r.status === 'resolved' || r.status === 'dismissed') throw conflict('This case is closed.', 'case_closed');
      if (r.assigned_to && r.assigned_to !== c.me.userId) throw conflict('This case is already assigned.', 'already_assigned');
      await c.db.run("UPDATE moderation_cases SET assigned_to = $2, status = 'in_review' WHERE id = $1", [r.id, c.me.userId]);
      await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: 'moderation.case_assigned', targetType: 'case', targetId: r.id, caseId: r.id }, c.now());
      return { ok: true };
    });

    router.post('/api/moderation/cases/:id/review-content', { auth: { perm: 'moderation.case.review_content' }, body: z.object({ reason }).strict(), rate: { key: 'mod:review', limit: 120, windowMs: 3600_000 } }, async (c) => {
      const r = await loadCase(c.db, id.parse(c.params.id));
      await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: 'moderation.content_reviewed', targetType: r.target_type, targetId: r.target_id, caseId: r.id, reason: c.body.reason }, c.now());
      if (r.status === 'open') await c.db.run("UPDATE moderation_cases SET status = 'in_review', assigned_to = COALESCE(assigned_to, $2) WHERE id = $1", [r.id, c.me.userId]);
      const reports = await c.db.query<any>('SELECT category, details, created_at FROM reports WHERE case_id = $1 ORDER BY created_at LIMIT 20', [r.id]);
      // The snapshot holds the reported material only. Anonymous content has no author in it; reporter identities are not included.
      return { snapshot: json(r.snapshot, {}), reports: reports.map((x) => ({ category: x.category, details: x.details, at: x.created_at })) };
    });

    router.post('/api/moderation/cases/:id/actions', {
      auth: { perm: 'moderation.case.act' },
      body: z.object({ action: z.enum(ACTIONS), note: z.string().trim().min(5).max(500), until: z.string().datetime().optional() }).strict(),
      rate: { key: 'mod:act', limit: 120, windowMs: 3600_000 },
    }, async (c) => {
      const cs = await loadCase(c.db, id.parse(c.params.id));
      const b = c.body; const now = c.now(); const nowIso = now.toISOString();
      if (cs.status === 'resolved' || cs.status === 'dismissed') throw conflict('This case is closed.', 'case_closed');
      const targetUser: string | null = cs.target_user_id ?? null;
      const actionId = uuid();
      let result: Record<string, unknown> = {};

      const record = (t: Db, affected: string | null, until?: string) =>
        t.run('INSERT INTO moderation_actions (id, case_id, moderator_id, action, note, until, affected_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [actionId, cs.id, c.me.userId, b.action, b.note, until ?? null, affected, nowIso]);

      switch (b.action) {
        case 'remove_content': {
          if (cs.target_type !== 'post' && cs.target_type !== 'comment') throw badRequest('Only posts and comments can be removed.');
          await c.db.tx(async (t) => {
            const table = cs.target_type === 'post' ? 'posts' : 'comments';
            await t.run(`UPDATE ${table} SET status = 'removed'${cs.target_type === 'post' ? ', removed_reason = $2' : ''} WHERE id = $1`, cs.target_type === 'post' ? [cs.target_id, cs.category.replace(/_/g, ' ')] : [cs.target_id]);
            await record(t, targetUser);
            if (targetUser) await notify(t, { userId: targetUser, type: 'moderation', data: { actionId, action: 'remove_content', category: cs.category } }, now);
          });
          break;
        }
        case 'warn': case 'send_resources': {
          if (!targetUser) throw badRequest('There is no account to notify.');
          await c.db.tx(async (t) => { await record(t, targetUser); await notify(t, { userId: targetUser, type: 'moderation', data: { actionId, action: b.action, category: cs.category } }, now); });
          break;
        }
        case 'suspend': {
          if (!c.can('moderation.user.suspend')) throw forbidden('You cannot suspend accounts.', 'permission_denied');
          if (!targetUser) throw badRequest('There is no account to suspend.');
          const until = b.until ?? new Date(now.getTime() + 7 * 86400_000).toISOString();
          if (new Date(until) <= now || new Date(until).getTime() - now.getTime() > 90 * 86400_000) throw badRequest('Choose a suspension end between now and 90 days from now.');
          if (targetUser === c.me.userId) throw forbidden('You cannot act on your own account.');
          const holder = await c.db.get("SELECT 1 AS x FROM role_grants WHERE user_id = $1 AND revoked_at IS NULL AND role IN ('founder','council','high_council')", [targetUser]);
          if (holder) throw forbidden('Governance members cannot be suspended through the moderation queue.', 'governance_protected');
          await c.db.tx(async (t) => {
            await t.run("UPDATE users SET status = 'suspended', suspended_until = $2, updated_at = $3 WHERE id = $1 AND status = 'active'", [targetUser, until, nowIso]);
            await record(t, targetUser, until);
            await notify(t, { userId: targetUser, type: 'moderation', data: { actionId, action: 'suspend', until } }, now);
          });
          result = { until };
          break;
        }
        case 'reveal_author': {
          if (!c.can('moderation.reveal_anonymous')) { await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: 'moderation.reveal_denied', caseId: cs.id, outcome: 'denied', reason: b.note }, now); throw forbidden('Revealing an anonymous author is not permitted for your role.', 'permission_denied'); }
          await c.requireStepUp();
          if (b.note.length < 20) throw badRequest('Revealing an author needs a written reason of at least 20 characters.');
          if (cs.target_type !== 'post' && cs.target_type !== 'comment') throw badRequest('Only anonymous posts and comments have a hidden author.');
          const deny = async (why: string, message: string, code: string) => { await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: 'moderation.reveal_denied', caseId: cs.id, outcome: 'denied', reason: why }, now); throw forbidden(message, code); };
          // A reveal is only for a live, documented case in which the moderator has already looked at the reported material under a recorded reason.
          // Conflict of interest: you cannot reveal your own content, nor the author of something you reported yourself.
          const reporter = await c.db.get('SELECT 1 AS x FROM reports WHERE case_id = $1 AND reporter_id = $2', [cs.id, c.me.userId]);
          if (reporter) await deny('moderator is a reporter on this case', 'You reported this content, so someone else must decide whether to reveal its author.', 'conflict_of_interest');
          const recent = await c.db.get<{ n: number | string }>("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'moderation.anonymous_author_revealed' AND actor_id = $1 AND occurred_at > $2", [c.me.userId, new Date(now.getTime() - 24 * 3600_000).toISOString()]);
          if (Number(recent?.n ?? 0) >= 5) await deny('daily reveal limit reached', 'You have reached the daily limit for author reveals. Ask a colleague or the Trust, Safety & Privacy lead.', 'reveal_limit');
          const authorId = await getAnonymousAuthor(c.db, cs.target_type, cs.target_id);
          if (authorId && authorId === c.me.userId) await deny('moderator is the author', 'You are the author of this content, so you cannot reveal or act on its authorship.', 'conflict_of_interest');
          if (cs.assigned_to && cs.assigned_to !== c.me.userId) await deny('case assigned to someone else', 'This case is assigned to another moderator.', 'case_assigned_elsewhere');
          const looked = await c.db.get("SELECT 1 AS x FROM audit_events WHERE action = 'moderation.content_reviewed' AND case_id = $1 AND actor_id = $2 AND outcome = 'success'", [cs.id, c.me.userId]);
          if (!looked) await deny('content not reviewed first', 'Review the reported material on this case (with a recorded reason) before asking to reveal its author.', 'review_required');
          const u = authorId ? await c.db.get<any>('SELECT handle, display_name FROM users WHERE id = $1', [authorId]) : null;
          await c.db.tx(async (t) => { await record(t, authorId); });
          await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: 'moderation.anonymous_author_revealed', targetType: cs.target_type, targetId: cs.target_id, caseId: cs.id, reason: b.note }, now);
          // Oversight: the Council and Founder are told that a reveal happened (case and category only, never the identity) and can review it.
          const overseers = await c.db.query<{ user_id: string }>("SELECT DISTINCT user_id FROM role_grants WHERE role IN ('council','founder') AND revoked_at IS NULL AND user_id <> $1", [c.me.userId]);
          for (const o of overseers) await notify(c.db, { userId: o.user_id, type: 'system', data: { text: `An anonymous-author reveal was recorded on a ${cs.category.replace(/_/g, ' ')} case. Review it in Moderation → Reveal oversight.`, href: '#/moderation' } }, now);
          result = { author: u ? { handle: u.handle, displayName: u.display_name } : null, note: 'This reveal is recorded in the audit log together with your reason.' };
          return created({ actionId, ...result });
        }
        case 'escalate': {
          await c.db.tx(async (t) => { await t.run("UPDATE moderation_cases SET priority = 'high', status = 'in_review' WHERE id = $1 AND priority IN ('normal','low')", [cs.id]); await record(t, null); });
          break;
        }
        case 'dismiss': case 'resolve': {
          const status = b.action === 'dismiss' ? 'dismissed' : 'resolved';
          await c.db.tx(async (t) => {
            await t.run('UPDATE moderation_cases SET status = $2, resolution = $3, resolution_note = $4, resolved_at = $5 WHERE id = $1', [cs.id, status, b.action, b.note, nowIso]);
            await t.run("UPDATE reports SET status = 'resolved', updated_at = $2 WHERE case_id = $1", [cs.id, nowIso]);
            await record(t, null);
            for (const rp of await t.query<{ reporter_id: string | null }>('SELECT DISTINCT reporter_id FROM reports WHERE case_id = $1 AND reporter_id IS NOT NULL', [cs.id]))
              await notify(t, { userId: rp.reporter_id!, type: 'report_update', data: { caseId: cs.id } }, now);
          });
          break;
        }
      }
      if (cs.status === 'open') await c.db.run("UPDATE moderation_cases SET status = 'in_review', assigned_to = COALESCE(assigned_to, $2) WHERE id = $1 AND status = 'open'", [cs.id, c.me.userId]);
      await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: `moderation.${b.action}`, targetType: cs.target_type, targetId: cs.target_id, caseId: cs.id, reason: b.note }, now);
      return created({ actionId, ...result });
    });

    // ───────── what moderators did to ME, and appeals ─────────
    router.get('/api/safety/actions', { auth: 'session' }, async (c) => {
      const rows = await c.db.query<any>(
        `SELECT a.id, a.action, a.note, a.until, a.created_at, k.category, k.target_type,
                (SELECT status FROM appeals p WHERE p.action_id = a.id AND p.user_id = $1) AS appeal_status
           FROM moderation_actions a JOIN moderation_cases k ON k.id = a.case_id
          WHERE a.affected_user_id = $1 AND a.action IN ('remove_content','warn','suspend','send_resources') ORDER BY a.created_at DESC LIMIT 50`, [c.me.userId]);
      return { items: rows.map((r) => ({ id: r.id, action: r.action, note: r.action === 'send_resources' ? null : r.note, until: r.until, at: r.created_at, category: r.category, appealStatus: r.appeal_status ?? null, canAppeal: r.action !== 'send_resources' && !r.appeal_status })) };
    });

    router.post('/api/appeals', { auth: 'session', body: z.object({ actionId: id, statement: z.string().trim().min(20, 'Tell us in at least 20 characters why you disagree.').max(1500) }).strict(), rate: { key: 'appeal', limit: 5, windowMs: 24 * 3600_000 } }, async (c) => {
      const a = await c.db.get<any>("SELECT id FROM moderation_actions WHERE id = $1 AND affected_user_id = $2 AND action IN ('remove_content','warn','suspend')", [c.body.actionId, c.me.userId]);
      if (!a) throw notFound('We couldn’t find that action.');
      if (await c.db.get('SELECT 1 AS x FROM appeals WHERE action_id = $1', [a.id])) throw conflict('You already appealed this action.', 'already_appealed');
      const pid = uuid();
      await c.db.run('INSERT INTO appeals (id, action_id, user_id, statement, created_at) VALUES ($1,$2,$3,$4,$5)', [pid, a.id, c.me.userId, c.body.statement, c.now().toISOString()]);
      await audit(c.db, { actorId: c.me.userId, action: 'appeal.filed', targetType: 'action', targetId: a.id }, c.now());
      return created({ appeal: { id: pid, status: 'open' } });
    });

    router.get('/api/moderation/appeals', { auth: { perm: 'moderation.case.act' } }, async (c) => {
      const rows = await c.db.query<any>(
        `SELECT p.id, p.statement, p.created_at, a.action, a.case_id, a.moderator_id, k.category FROM appeals p JOIN moderation_actions a ON a.id = p.action_id JOIN moderation_cases k ON k.id = a.case_id WHERE p.status = 'open' ORDER BY p.created_at LIMIT 100`);
      return { items: rows.map((r) => ({ id: r.id, statement: r.statement, at: r.created_at, action: r.action, caseId: r.case_id, category: r.category, mine: r.moderator_id === c.me.userId })) };
    });

    router.post('/api/moderation/appeals/:id/decide', { auth: { perm: 'moderation.case.act' }, body: z.object({ decision: z.enum(['upheld', 'overturned']), note: reason }).strict() }, async (c) => {
      const p = await c.db.get<any>('SELECT p.*, a.moderator_id, a.action, a.case_id, k.target_type, k.target_id FROM appeals p JOIN moderation_actions a ON a.id = p.action_id JOIN moderation_cases k ON k.id = a.case_id WHERE p.id = $1', [id.parse(c.params.id)]);
      if (!p) throw notFound();
      if (p.status !== 'open') throw conflict('This appeal has been decided.', 'already_decided');
      if (p.moderator_id === c.me.userId) throw forbidden('An appeal must be decided by someone other than the person who took the action.', 'conflict_of_interest');
      const now = c.now(); const nowIso = now.toISOString();
      await c.db.tx(async (t) => {
        await t.run('UPDATE appeals SET status = $2, reviewed_by = $3, decided_at = $4 WHERE id = $1', [p.id, c.body.decision, c.me.userId, nowIso]);
        if (c.body.decision === 'overturned') {
          if (p.action === 'remove_content') await t.run(`UPDATE ${p.target_type === 'post' ? 'posts' : 'comments'} SET status = 'published'${p.target_type === 'post' ? ', removed_reason = NULL' : ''} WHERE id = $1 AND status = 'removed'`, [p.target_id]);
          if (p.action === 'suspend' && p.user_id) await t.run("UPDATE users SET status = 'active', suspended_until = NULL, updated_at = $2 WHERE id = $1 AND status = 'suspended'", [p.user_id, nowIso]);
        }
        if (p.user_id) await notify(t, { userId: p.user_id, type: 'appeal', data: { decision: c.body.decision } }, now);
      });
      await audit(c.db, { actorId: c.me.userId, actorRole: roleLabel(c), action: `appeal.${c.body.decision}`, targetType: 'appeal', targetId: p.id, caseId: p.case_id, reason: c.body.note }, now);
      return { ok: true };
    });

    registerEraser('moderation', async (db, userId) => {
      // Cases are kept (they protect other people) but lose the link to a deleted account; appeals text is dropped.
      // Closed cases lose the frozen content too; open cases keep it until they are closed so other people stay protected.
      await db.run("UPDATE moderation_cases SET snapshot = '{}' WHERE target_user_id = $1 AND status IN ('resolved','dismissed')", [userId]);
      const a = await db.run('UPDATE moderation_cases SET target_user_id = NULL WHERE target_user_id = $1', [userId]);
      await db.run('UPDATE moderation_actions SET affected_user_id = NULL WHERE affected_user_id = $1', [userId]);
      const b = await db.run("UPDATE appeals SET user_id = NULL, statement = '[removed with account]' WHERE user_id = $1", [userId]);
      return { counts: { cases_detached: a.changes, appeals_scrubbed: b.changes } };
    });
    registerExporter('moderation', async (db, userId) => ({
      actionsAffectingYou: await db.query('SELECT a.action, a.created_at, k.category FROM moderation_actions a JOIN moderation_cases k ON k.id = a.case_id WHERE a.affected_user_id = $1', [userId]),
      appeals: await db.query('SELECT statement, status, created_at FROM appeals WHERE user_id = $1', [userId]),
    }));
    void s;
  },
};
