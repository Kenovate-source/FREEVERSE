import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { uuid } from '../db';
import { audit } from '../services/audit';
import { POLL_ELIGIBILITY, POLL_LIMITS as L, type PollState, type PollView } from '../../shared/polls';
import type { Db } from '../db';
import { registerEraser, registerExporter } from '../services/erasure';

const id = z.string().uuid();
const GOV_ROLES = "('council','high_council','director','guardian','founder')";

async function isEligible(db: Db, p: any, userId: string): Promise<boolean> {
  if (p.eligibility === 'citizens') return !!(await db.get("SELECT 1 AS x FROM users WHERE id = $1 AND status = 'active'", [userId]));
  if (p.eligibility === 'governance') return !!(await db.get(`SELECT 1 AS x FROM role_grants WHERE user_id = $1 AND revoked_at IS NULL AND restricted_at IS NULL AND role IN ${GOV_ROLES}`, [userId]));
  return !!(p.community_id && await db.get('SELECT 1 AS x FROM community_members WHERE community_id = $1 AND user_id = $2', [p.community_id, userId]));
}
async function eligibleCount(db: Db, p: any): Promise<number> {
  const n = p.eligibility === 'citizens' ? await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE status = 'active'")
    : p.eligibility === 'governance' ? await db.get<{ n: number }>(`SELECT COUNT(DISTINCT user_id) AS n FROM role_grants WHERE revoked_at IS NULL AND restricted_at IS NULL AND role IN ${GOV_ROLES}`)
    : await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM community_members WHERE community_id = $1', [p.community_id]);
  return Number(n?.n ?? 0);
}
const stateOf = (p: any, now: Date): PollState => (p.status === 'open' && p.closes_at && new Date(p.closes_at).getTime() <= now.getTime() ? 'closed' : p.status);

async function view(db: Db, p: any, me: string, now: Date): Promise<PollView> {
  const state = stateOf(p, now); const opts = await db.query<any>('SELECT * FROM gov_poll_options WHERE poll_id = $1 ORDER BY sort_order', [p.id]);
  const tallies = new Map((await db.query<any>('SELECT option_id, COUNT(*) AS n FROM gov_poll_votes WHERE poll_id = $1 GROUP BY option_id', [p.id])).map((r) => [r.option_id, Number(r.n)]));
  const total = [...tallies.values()].reduce((a, b) => a + b, 0); const mine = await db.get<any>('SELECT option_id FROM gov_poll_votes WHERE poll_id = $1 AND user_id = $2', [p.id, me]);
  const comm = p.community_id ? await db.get<any>('SELECT name FROM communities WHERE id = $1', [p.community_id]) : null;
  const el = POLL_ELIGIBILITY.find((x) => x[0] === p.eligibility)!;
  return { id: p.id, title: p.title, description: p.description, state, eligibility: p.eligibility, eligibilityText: p.eligibility === 'community' ? `Members of ${comm?.name ?? 'a community'}.` : el[2], communityName: comm?.name ?? null, closesAt: p.closes_at ?? null, openedAt: p.opened_at ?? null,
    // Totals per option appear only once voting has closed, so nobody is steered by a running count.
    options: opts.map((o) => ({ id: o.id, label: o.label, votes: state === 'closed' ? tallies.get(o.id) ?? 0 : null })), turnout: { votes: total, eligible: await eligibleCount(db, p) },
    viewer: { eligible: await isEligible(db, p, me), votedOptionId: mine?.option_id ?? null }, decision: p.decision ?? null, decidedAt: p.decided_at ?? null, cancelReason: p.cancel_reason ?? null,
    advisory: 'This poll is advisory. It informs a decision; the Founder records the decision and the reasons afterwards.', resultsNote: 'Each person has one vote and it is final. Totals appear when voting closes. Nobody can see how an individual voted.' };
}

const createBody = z.object({
  title: z.string().trim().min(L.titleMin).max(L.titleMax), description: z.string().trim().min(L.descMin).max(L.descMax), eligibility: z.enum(['citizens', 'governance', 'community']), communitySlug: z.string().max(60).optional(),
  options: z.array(z.string().trim().min(1).max(L.optionMax)).min(L.optionsMin).max(L.optionsMax),
}).strict();

export const pollsModule: ModuleDef = {
  name: 'polls',
  register(router) {
    registerEraser('gov_poll_votes', async (db, userId) => ({ counts: { gov_poll_votes: (await db.run('DELETE FROM gov_poll_votes WHERE user_id = $1', [userId])).changes } }));
    registerExporter('gov_poll_votes', async (db, userId) => db.query('SELECT poll_id, created_at FROM gov_poll_votes WHERE user_id = $1', [userId]));
    // ───────── members ─────────
    router.get('/api/polls', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>("SELECT * FROM gov_polls WHERE status = 'open' ORDER BY closes_at DESC LIMIT 100");
      const out: PollView[] = []; for (const r of rows) { if (await isEligible(c.db, r, c.me.userId)) out.push(await view(c.db, r, c.me.userId, c.now())); }
      return { items: out };
    });
    router.get('/api/polls/:id', { auth: 'active' }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!p || p.status === 'draft' || !(await isEligible(c.db, p, c.me.userId))) throw notFound('We couldn’t find that poll.');
      return { poll: await view(c.db, p, c.me.userId, c.now()) };
    });
    router.post('/api/polls/:id/vote', { auth: 'active', body: z.object({ optionId: id }).strict(), rate: { key: 'poll:vote', limit: 30, windowMs: 3600_000 } }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!p || p.status !== 'open') throw notFound('We couldn’t find that poll.');
      if (!(await isEligible(c.db, p, c.me.userId))) throw notFound('We couldn’t find that poll.');
      if (stateOf(p, c.now()) !== 'open') throw conflict('Voting has closed.', 'poll_closed');
      if (!(await c.db.get('SELECT 1 AS x FROM gov_poll_options WHERE id = $1 AND poll_id = $2', [c.body.optionId, p.id]))) throw notFound('That option doesn’t exist.');
      if (await c.db.get('SELECT 1 AS x FROM gov_poll_votes WHERE poll_id = $1 AND user_id = $2', [p.id, c.me.userId])) throw conflict('You have already voted. Votes are final.', 'already_voted');
      await c.db.run('INSERT INTO gov_poll_votes (poll_id, user_id, option_id, created_at) VALUES ($1,$2,$3,$4)', [p.id, c.me.userId, c.body.optionId, c.now().toISOString()]);
      return { poll: await view(c.db, p, c.me.userId, c.now()) };
    });

    // ───────── Founder (governance.manage) ─────────
    router.get('/api/founder/polls', { auth: { perm: 'governance.manage' } }, async (c) => {
      const rows = await c.db.query<any>('SELECT * FROM gov_polls ORDER BY created_at DESC LIMIT 100');
      return { items: await Promise.all(rows.map((r) => view(c.db, r, c.me.userId, c.now()))) };
    });
    router.post('/api/founder/polls', { auth: { perm: 'governance.manage' }, body: createBody }, async (c) => {
      const b = c.body; let communityId: string | null = null;
      if (b.eligibility === 'community') { const com = await c.db.get<any>("SELECT id FROM communities WHERE slug = $1 AND status = 'active'", [b.communitySlug ?? '']); if (!com) throw notFound('Choose an existing community.'); communityId = com.id; }
      else if (b.communitySlug) throw conflict('A community can only be chosen when eligibility is “one community’s members”.', 'invalid_eligibility');
      const labels = b.options.map((o) => o.trim()); if (new Set(labels.map((x) => x.toLowerCase())).size !== labels.length) throw conflict('Each option must be different.', 'duplicate_options');
      const pid = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        await t.run("INSERT INTO gov_polls (id, title, description, eligibility, community_id, status, created_by, created_at) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7)", [pid, b.title, b.description, b.eligibility, communityId, c.me.userId, now]);
        for (const [i, l] of labels.entries()) await t.run('INSERT INTO gov_poll_options (id, poll_id, label, sort_order) VALUES ($1,$2,$3,$4)', [uuid(), pid, l, i]);
      });
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'poll.drafted', targetType: 'poll', targetId: pid }, c.now());
      return created({ poll: await view(c.db, await c.db.get('SELECT * FROM gov_polls WHERE id = $1', [pid]), c.me.userId, c.now()) });
    });
    router.post('/api/founder/polls/:id/publish', { auth: { perm: 'governance.manage' }, body: z.object({ closesAt: z.string().datetime() }).strict() }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']); if (!p) throw notFound();
      if (p.status !== 'draft') throw conflict('Only a draft can be published.', 'not_draft');
      const closes = new Date(c.body.closesAt).getTime(); const now = c.now().getTime();
      if (closes < now + L.minHours * 3600_000) throw conflict(`Voting must stay open for at least ${L.minHours} hour.`, 'deadline_too_soon');
      if (closes > now + L.maxDays * 86400_000) throw conflict(`Voting can stay open for at most ${L.maxDays} days.`, 'deadline_too_far');
      await c.db.run("UPDATE gov_polls SET status = 'open', opened_at = $2, closes_at = $3 WHERE id = $1", [p.id, c.now().toISOString(), c.body.closesAt]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'poll.published', targetType: 'poll', targetId: p.id, meta: { eligibility: p.eligibility, closesAt: c.body.closesAt } }, c.now());
      return { poll: await view(c.db, await c.db.get('SELECT * FROM gov_polls WHERE id = $1', [p.id]), c.me.userId, c.now()) };
    });
    router.post('/api/founder/polls/:id/cancel', { auth: { perm: 'governance.manage' }, body: z.object({ reason: z.string().trim().min(10).max(400) }).strict() }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']); if (!p) throw notFound();
      if (stateOf(p, c.now()) === 'closed' || p.status === 'cancelled') throw conflict('This poll has already ended.', 'already_ended');
      await c.db.run("UPDATE gov_polls SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [p.id, c.body.reason]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'poll.cancelled', targetType: 'poll', targetId: p.id, reason: c.body.reason }, c.now());
      return { ok: true };
    });
    router.post('/api/founder/polls/:id/decision', { auth: { perm: 'governance.manage' }, body: z.object({ decision: z.string().trim().min(L.decisionMin).max(L.decisionMax) }).strict() }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']); if (!p) throw notFound();
      if (stateOf(p, c.now()) !== 'closed') throw conflict('Record a decision after voting has closed.', 'not_closed');
      await c.db.run('UPDATE gov_polls SET decision = $2, decided_at = $3 WHERE id = $1', [p.id, c.body.decision, c.now().toISOString()]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'poll.decision_recorded', targetType: 'poll', targetId: p.id }, c.now());
      return { poll: await view(c.db, await c.db.get('SELECT * FROM gov_polls WHERE id = $1', [p.id]), c.me.userId, c.now()) };
    });
  },
};
