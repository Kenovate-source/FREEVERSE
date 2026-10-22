import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { contains, json, uuid } from '../db';
import { GOVERNANCE_LEVELS } from '../../shared/constants';
import { ACTIONS, actionList } from '../governance/actions';
import { createProposal, decide, rollback, WorkflowError } from '../governance/proposals';
import { audit } from '../services/audit';
import { registerEraser } from '../services/erasure';
import type { Ctx } from '../http/router';

const id = z.string().uuid();
const wf = async <T>(fn: () => Promise<T>): Promise<T> => {
  try { return await fn(); } catch (e) { if (e instanceof WorkflowError) { if (e.status === 403) throw forbidden(e.message, e.code); if (e.status === 404) throw notFound(e.message); if (e.status === 409) throw conflict(e.message, e.code); throw badRequest(e.message, undefined, e.code); } throw e; }
};
const roleName = (c: Ctx<any, any>) => (c.me.roles.includes('founder') ? 'founder' : c.me.roles[0] ?? 'member');

const proposalView = (p: any) => ({
  id: p.id, source: p.source, kind: p.kind, actionType: p.action_type, title: p.title, rationale: p.rationale, impact: json(p.impact, {}), evidence: json(p.evidence, []), payload: json(p.payload, {}),
  risk: p.effective_risk, status: p.status, decidedAt: p.decided_at, decisionNote: p.decision_note, autoExecuted: p.auto_executed === true || p.auto_executed === 1,
  executedAt: p.executed_at, executionResult: json(p.execution_result, null), verification: json(p.verification, null), canRollback: p.status === 'executed' && !!p.rollback_data && !!ACTIONS[p.action_type]?.rollback, createdAt: p.created_at,
});

export const governanceModule: ModuleDef = {
  name: 'governance',
  register(router, s) {
    router.get('/api/governance/public', { auth: 'active' }, async (c) => {
      const seats = await c.db.query<any>('SELECT level, holder_user_id FROM governance_seats');
      return {
        structure: GOVERNANCE_LEVELS.map((l) => ({ level: l.level, name: l.name, seats: l.seats, filled: seats.filter((x) => x.level === l.level && x.holder_user_id).length })),
        citizens: 'Everyone else is a Citizen: every member of FREEVERSE.',
        principles: [
          'Holding a governance title does not give access to anyone’s private messages, journals or Nova conversations. Those are never readable through governance.',
          'Moderation access is separate, narrow, needs a written reason for each look, and is audited.',
          'Sensitive changes need explicit approval and are recorded in an append-only audit log.',
        ],
      };
    });

    router.get('/api/governance/structure', { auth: { perm: 'governance.view' } }, async (c) => {
      const rows = await c.db.query<any>(
        `SELECT g.id, g.level, g.seat_no, g.title, g.responsibilities, g.appointed_at, u.handle, u.display_name, u.id AS uid FROM governance_seats g LEFT JOIN users u ON u.id = g.holder_user_id ORDER BY g.level, g.seat_no`);
      return {
        levels: GOVERNANCE_LEVELS.map((l) => ({ level: l.level, name: l.name, seats: rows.filter((r) => r.level === l.level).map((r) => ({ id: r.id, seatNo: r.seat_no, title: r.title, responsibilities: r.responsibilities, appointedAt: r.appointed_at, holder: r.uid ? { handle: r.handle, displayName: r.display_name } : null })) })),
        note: 'Titles and responsibilities for the seven, twelve and twenty-four seats are not defined in Governance.md v2.0. They start vacant with generic names and are set by the Founder.',
      };
    });

    router.get('/api/governance/people', { auth: 'active', query: z.object({ q: z.string().trim().min(2).max(40) }) }, async (c) => {
      if (!c.can('governance.appoint') && !c.can('governance.propose')) throw forbidden('You cannot search for appointees.', 'permission_denied');
      const l = contains(c.query.q);
      const rows = await c.db.query<any>(`SELECT id, handle, display_name FROM users WHERE status = 'active' AND (lower(handle) LIKE $1 ESCAPE '\\' OR lower(display_name) LIKE $1 ESCAPE '\\') ORDER BY handle LIMIT 10`, [l]);
      return { items: rows.map((r) => ({ id: r.id, handle: r.handle, displayName: r.display_name })) };
    });

    router.get('/api/governance/actions', { auth: { perm: 'proposals.view' } }, async () => ({ actions: actionList() }));

    // ───────── proposals ─────────
    router.get('/api/proposals', { auth: { perm: 'proposals.view' }, query: z.object({ status: z.string().max(30).optional(), source: z.string().max(30).optional() }) }, async (c) => {
      const params: unknown[] = []; let w = '';
      if (c.query.status) { params.push(c.query.status); w += ` AND status = $${params.length}`; }
      if (c.query.source) { params.push(c.query.source); w += ` AND source = $${params.length}`; }
      const rows = await c.db.query<any>(`SELECT * FROM proposals WHERE 1 = 1${w} ORDER BY created_at DESC LIMIT 200`, params);
      return { items: rows.map(proposalView), pending: rows.filter((r) => r.status === 'pending_approval').length };
    });
    router.get('/api/proposals/:id', { auth: { perm: 'proposals.view' } }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM proposals WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!p) throw notFound('Proposal not found.');
      const events = await c.db.query<any>('SELECT actor_label, event, note, occurred_at FROM proposal_events WHERE proposal_id = $1 ORDER BY occurred_at, id', [p.id]);
      return { proposal: proposalView(p), events: events.map((e) => ({ by: e.actor_label, event: e.event, note: e.note, at: e.occurred_at })) };
    });

    const propBody = z.object({ actionType: z.string().max(60), payload: z.unknown(), title: z.string().trim().min(5).max(140), rationale: z.string().trim().max(1500).default('') }).strict();
    // Council members may PROPOSE appointments (to seats below the Council); the Founder decides.
    router.post('/api/governance/proposals', { auth: { perm: 'governance.propose' }, body: propBody, rate: { key: 'proposal:create', limit: 20, windowMs: 3600_000 } }, async (c) => {
      const isFounder = c.can('proposals.decide');
      if (!isFounder && c.body.actionType !== 'governance.appoint') throw forbidden('Council members can propose appointments. Other changes are the Founder’s.', 'permission_denied');
      const r = await wf(() => createProposal(s, { source: isFounder ? 'founder' : 'council', requestedBy: c.me.userId, actionType: c.body.actionType, payload: c.body.payload, title: c.body.title, rationale: c.body.rationale }));
      return created(r);
    });

    router.post('/api/proposals/:id/decision', { auth: { perm: 'proposals.decide' }, body: z.object({ decision: z.enum(['approve', 'reject', 'revise']), note: z.string().trim().max(500).optional() }).strict() }, async (c) => {
      const p = await c.db.get<any>('SELECT action_type FROM proposals WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!p) throw notFound('Proposal not found.');
      if (c.body.decision === 'approve' && ACTIONS[p.action_type]?.risk === 'high') await c.requireStepUp();
      if (c.body.decision !== 'approve' && !c.body.note) throw badRequest('Please add a note explaining your decision.');
      const r = await wf(() => decide(s, c.params.id!, { userId: c.me.userId, role: roleName(c), canDecide: c.can('proposals.decide') }, c.body.decision, c.body.note ?? null));
      const full = await c.db.get<any>('SELECT * FROM proposals WHERE id = $1', [c.params.id]);
      return { status: r.status, proposal: proposalView(full) };
    });

    router.post('/api/proposals/:id/rollback', { auth: { perm: 'proposals.decide' } }, async (c) => {
      const p = await c.db.get<any>('SELECT action_type FROM proposals WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!p) throw notFound('Proposal not found.');
      if (ACTIONS[p.action_type]?.risk === 'high') await c.requireStepUp();
      await wf(() => rollback(s, c.params.id!, { userId: c.me.userId, role: roleName(c), canDecide: c.can('proposals.decide') }));
      return { ok: true };
    });

    // The Founder acting directly: recorded as a proposal that is created and approved in one step, so history is uniform.
    router.post('/api/proposals/direct', { auth: { perm: 'proposals.decide' }, body: propBody, rate: { key: 'proposal:direct', limit: 60, windowMs: 3600_000 } }, async (c) => {
      const def = ACTIONS[c.body.actionType];
      if (!def) throw badRequest('Unknown action.', undefined, 'unknown_action');
      if (def.risk === 'high') await c.requireStepUp();
      const r = await wf(() => createProposal(s, { source: 'founder', requestedBy: c.me.userId, actionType: c.body.actionType, payload: c.body.payload, title: c.body.title, rationale: c.body.rationale }));
      const d = await wf(() => decide(s, r.id, { userId: c.me.userId, role: roleName(c), canDecide: true }, 'approve', 'Decided directly by the Founder.'));
      const full = await c.db.get<any>('SELECT * FROM proposals WHERE id = $1', [r.id]);
      return created({ status: d.status, proposal: proposalView(full) });
    });

    // ───────── access ─────────
    router.get('/api/governance/access', { auth: { perm: 'access_review.view' } }, async (c) => {
      const rows = await c.db.query<any>(`SELECT g.id, g.role, g.granted_at, g.reason, g.seat_id, u.handle, u.display_name, gb.handle AS by_handle FROM role_grants g JOIN users u ON u.id = g.user_id LEFT JOIN users gb ON gb.id = g.granted_by WHERE g.revoked_at IS NULL ORDER BY g.role, g.granted_at`);
      return { grants: rows.map((r) => ({ id: r.id, role: r.role, grantedAt: r.granted_at, reason: r.reason, holder: { handle: r.handle, displayName: r.display_name }, grantedBy: r.by_handle ?? null, seat: !!r.seat_id })), reviews: (await c.db.query<any>('SELECT id, status, started_at, completed_at FROM access_reviews ORDER BY started_at DESC LIMIT 20')).map((r) => ({ id: r.id, status: r.status, startedAt: r.started_at, completedAt: r.completed_at })) };
    });

    router.post('/api/governance/access-reviews', { auth: { perm: 'access_review.run' } }, async (c) => {
      if (await c.db.get("SELECT 1 AS x FROM access_reviews WHERE status = 'open'")) throw conflict('A review is already open. Complete it first.', 'review_open');
      const rid = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        await t.run("INSERT INTO access_reviews (id, started_by, status, started_at) VALUES ($1,$2,'open',$3)", [rid, c.me.userId, now]);
        for (const g of await t.query<any>("SELECT id, user_id, role FROM role_grants WHERE revoked_at IS NULL AND role <> 'founder'"))
          await t.run('INSERT INTO access_review_items (id, review_id, grant_id, user_id, role) VALUES ($1,$2,$3,$4,$5)', [uuid(), rid, g.id, g.user_id, g.role]);
      });
      await audit(c.db, { actorId: c.me.userId, actorRole: roleName(c), action: 'access_review.started', targetType: 'access_review', targetId: rid }, c.now());
      return created({ id: rid });
    });

    router.get('/api/governance/access-reviews/:id', { auth: { perm: 'access_review.view' } }, async (c) => {
      const r = await c.db.get<any>('SELECT * FROM access_reviews WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!r) throw notFound();
      const items = await c.db.query<any>('SELECT i.id, i.role, i.decision, i.note, u.handle, u.display_name FROM access_review_items i LEFT JOIN users u ON u.id = i.user_id WHERE i.review_id = $1 ORDER BY i.role', [r.id]);
      return { review: { id: r.id, status: r.status, startedAt: r.started_at }, items: items.map((i) => ({ id: i.id, role: i.role, decision: i.decision, note: i.note, holder: { handle: i.handle, displayName: i.display_name } })) };
    });

    router.patch('/api/governance/access-reviews/:id/items/:itemId', { auth: { perm: 'access_review.run' }, body: z.object({ decision: z.enum(['keep', 'revoke']), note: z.string().trim().max(300).optional() }).strict() }, async (c) => {
      const r = await c.db.run("UPDATE access_review_items SET decision = $3, note = $4, decided_at = $5 WHERE id = $2 AND review_id = $1 AND EXISTS (SELECT 1 FROM access_reviews a WHERE a.id = $1 AND a.status = 'open')", [c.params.id, c.params.itemId, c.body.decision, c.body.note ?? null, c.now().toISOString()]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    router.post('/api/governance/access-reviews/:id/complete', { auth: { perm: 'access_review.run' } }, async (c) => {
      const rv = await c.db.get<any>("SELECT * FROM access_reviews WHERE id = $1 AND status = 'open'", [id.safeParse(c.params.id).data ?? '']);
      if (!rv) throw notFound('That review is not open.');
      const items = await c.db.query<any>('SELECT * FROM access_review_items WHERE review_id = $1', [rv.id]);
      if (items.some((i) => i.decision === 'pending')) throw conflict('Every grant needs a decision (keep or revoke) before the review can be completed.', 'items_pending');
      const revokes = items.filter((i) => i.decision === 'revoke');
      if (revokes.length) await c.requireStepUp();
      const results: { role: string; status: string }[] = [];
      for (const i of revokes) {
        const live = await c.db.get('SELECT 1 AS x FROM role_grants WHERE id = $1 AND revoked_at IS NULL', [i.grant_id]);
        if (!live) { results.push({ role: i.role, status: 'already_revoked' }); continue; }
        const p = await wf(() => createProposal(s, { source: 'founder', requestedBy: c.me.userId, actionType: 'access_review.revoke', payload: { grantId: i.grant_id, reason: i.note && i.note.length >= 10 ? i.note : 'Revoked in access review' }, title: `Revoke ${i.role} (access review)` }));
        const d = await wf(() => decide(s, p.id, { userId: c.me.userId, role: roleName(c), canDecide: c.can('proposals.decide') }, 'approve', 'Decided in access review.'));
        results.push({ role: i.role, status: d.status });
      }
      await c.db.run("UPDATE access_reviews SET status = 'completed', completed_at = $2 WHERE id = $1", [rv.id, c.now().toISOString()]);
      await audit(c.db, { actorId: c.me.userId, actorRole: roleName(c), action: 'access_review.completed', targetType: 'access_review', targetId: rv.id, meta: { kept: items.length - revokes.length, revoked: revokes.length } }, c.now());
      return { ok: true, results };
    });

    registerEraser('governance', async (db, userId) => {
      // Handled by the account module for live grants; here we detach historical references.
      await db.run('UPDATE role_grants SET granted_by = NULL WHERE granted_by = $1', [userId]);
      await db.run('UPDATE role_grants SET revoked_by = NULL WHERE revoked_by = $1', [userId]);
      await db.run('UPDATE governance_seats SET appointed_by = NULL WHERE appointed_by = $1', [userId]);
      await db.run('UPDATE proposals SET requested_by = NULL WHERE requested_by = $1', [userId]);
      await db.run('UPDATE proposals SET decided_by = NULL WHERE decided_by = $1', [userId]);
      await db.run('UPDATE proposal_events SET actor_id = NULL WHERE actor_id = $1', [userId]);
      await db.run('DELETE FROM access_review_items WHERE user_id = $1', [userId]);
      return { counts: {} };
    });
  },
};
