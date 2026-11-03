import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, forbidden, notFound, badRequest } from '../http/errors';
import { created } from '../http/router';
import { uuid } from '../db';
import { audit } from '../services/audit';
import { POLL_ELIGIBILITY, POLL_LIMITS as L, type PollState, type PollView } from '../../shared/polls';
import type { Db } from '../db';
import type { Services } from '../services';
import { notify } from '../services/notify';
import { aiApi } from '../ai/runtime';
import { HttpError } from '../http/errors';
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
const stateOf = (p: any, now: Date): PollState => {
  if (p.status !== 'open') return p.status;
  if (p.opens_at && new Date(p.opens_at).getTime() > now.getTime()) return 'scheduled';
  return p.closes_at && new Date(p.closes_at).getTime() <= now.getTime() ? 'closed' : 'open';
};

/** Everyone who may vote in this poll (used only to send notifications; capped so one poll can't flood the database). */
async function eligibleIds(db: Db, p: any, cap: number): Promise<string[]> {
  const rows = p.eligibility === 'citizens' ? await db.query<any>(`SELECT id AS uid FROM users WHERE status = 'active' ORDER BY id LIMIT ${cap}`)
    : p.eligibility === 'governance' ? await db.query<any>(`SELECT DISTINCT user_id AS uid FROM role_grants WHERE revoked_at IS NULL AND restricted_at IS NULL AND role IN ${GOV_ROLES} LIMIT ${cap}`)
    : await db.query<any>(`SELECT user_id AS uid FROM community_members WHERE community_id = $1 LIMIT ${cap}`, [p.community_id]);
  return rows.map((r) => r.uid as string);
}
const NOTIFY_CAP = 2000;
const MSG = {
  opened: (t: string) => `A poll is open: “${t}”. Your vote is advisory input and is final once cast.`,
  closed: (t: string) => `Voting has closed on “${t}”. Totals are now visible.`,
  decision: (t: string) => `A decision was recorded on “${t}”.`,
} as const;
/** Sends one kind of poll notification once. Respects each person's own notification settings (the 'system' kind). */
async function announce(s: Services, pollId: string, kind: keyof typeof MSG): Promise<number> {
  const col = kind === 'opened' ? 'open_notified_at' : kind === 'closed' ? 'close_notified_at' : 'decision_notified_at';
  const now = s.now();
  // Claim first so two overlapping runs can't both send.
  const claim = await s.db.run(`UPDATE gov_polls SET ${col} = $2 WHERE id = $1 AND ${col} IS NULL AND status = 'open'`, [pollId, now.toISOString()]);
  if (!claim.changes) return 0;
  const p = await s.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [pollId]); if (!p) return 0;
  let sent = 0;
  for (const uid of await eligibleIds(s.db, p, NOTIFY_CAP)) {
    if (await notify(s.db, { userId: uid, type: 'system', data: { text: MSG[kind](p.title), href: '#/polls' } }, now)) sent++;
  }
  return sent;
}
/** Called by the maintenance job: announces polls that have opened or closed since the last run. Idempotent. */
export async function sweepPolls(s: Services): Promise<{ opened: number; closed: number }> {
  const now = s.now().toISOString(); let opened = 0, closed = 0;
  for (const r of await s.db.query<any>("SELECT id FROM gov_polls WHERE status = 'open' AND open_notified_at IS NULL AND (opens_at IS NULL OR opens_at <= $1)", [now])) opened += await announce(s, r.id, 'opened');
  for (const r of await s.db.query<any>("SELECT id FROM gov_polls WHERE status = 'open' AND close_notified_at IS NULL AND closes_at <= $1", [now])) closed += await announce(s, r.id, 'closed');
  return { opened, closed };
}

async function view(db: Db, p: any, me: string, now: Date): Promise<PollView> {
  const state = stateOf(p, now); const opts = await db.query<any>('SELECT * FROM gov_poll_options WHERE poll_id = $1 ORDER BY sort_order', [p.id]);
  const tallies = new Map((await db.query<any>('SELECT option_id, COUNT(*) AS n FROM gov_poll_votes WHERE poll_id = $1 GROUP BY option_id', [p.id])).map((r) => [r.option_id, Number(r.n)]));
  const total = [...tallies.values()].reduce((a, b) => a + b, 0); const mine = await db.get<any>('SELECT option_id FROM gov_poll_votes WHERE poll_id = $1 AND user_id = $2', [p.id, me]);
  const comm = p.community_id ? await db.get<any>('SELECT name FROM communities WHERE id = $1', [p.community_id]) : null;
  const el = POLL_ELIGIBILITY.find((x) => x[0] === p.eligibility)!;
  return { id: p.id, title: p.title, description: p.description, state, eligibility: p.eligibility, eligibilityText: p.eligibility === 'community' ? `Members of ${comm?.name ?? 'a community'}.` : el[2], communityName: comm?.name ?? null, closesAt: p.closes_at ?? null, opensAt: p.opens_at ?? null, openedAt: p.opened_at ?? null,
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
  register(router, s) {
    registerEraser('gov_poll_votes', async (db, userId) => ({ counts: { gov_poll_votes: (await db.run('DELETE FROM gov_poll_votes WHERE user_id = $1', [userId])).changes } }));
    registerExporter('gov_poll_votes', async (db, userId) => db.query('SELECT poll_id, created_at FROM gov_poll_votes WHERE user_id = $1', [userId]));
    // ───────── members ─────────
    router.get('/api/polls', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>("SELECT * FROM gov_polls WHERE status = 'open' ORDER BY closes_at DESC LIMIT 100");
      const out: PollView[] = []; for (const r of rows) { if (stateOf(r, c.now()) === 'scheduled') continue; if (await isEligible(c.db, r, c.me.userId)) out.push(await view(c.db, r, c.me.userId, c.now())); }
      return { items: out };
    });
    router.get('/api/polls/:id', { auth: 'active' }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!p || p.status === 'draft' || stateOf(p, c.now()) === 'scheduled' || !(await isEligible(c.db, p, c.me.userId))) throw notFound('We couldn’t find that poll.');
      return { poll: await view(c.db, p, c.me.userId, c.now()) };
    });
    router.post('/api/polls/:id/vote', { auth: 'active', body: z.object({ optionId: id }).strict(), rate: { key: 'poll:vote', limit: 30, windowMs: 3600_000 } }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!p || p.status !== 'open') throw notFound('We couldn’t find that poll.');
      if (!(await isEligible(c.db, p, c.me.userId))) throw notFound('We couldn’t find that poll.');
      if (stateOf(p, c.now()) === 'scheduled') throw notFound('We couldn’t find that poll.');
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
    // Founder AI can draft the wording. It never saves anything: the Founder reviews, edits and saves the draft like any other.
    router.post('/api/founder/polls/draft-assist', { auth: { perm: 'governance.manage' }, body: z.object({ topic: z.string().trim().min(10).max(400) }).strict(), rate: { key: 'poll:assist', limit: 20, windowMs: 3600_000 } }, async (c) => {
      if (s.ai.provider === 'demo') throw new HttpError(409, 'ai_unavailable', 'No AI model is connected, so there is nothing to draft with. Write the poll yourself below; it works the same.');
      const system = 'You help the Founder of FREEVERSE word an ADVISORY poll for community members. Reply with ONLY a JSON object: {"title": string, "description": string, "options": string[]}. ' +
        `Rules: the title is one neutral question (max ${L.titleMax} characters); the description gives balanced background without arguing for any option (max ${L.descMax} characters); 2 to ${L.optionsMax} options, each max ${L.optionMax} characters, worded neutrally and not leading. Do not invent facts about the platform.`;
      const r = await aiApi.callAgent(s, { agentId: 'founder-ai', userId: c.me.userId, messages: [{ role: 'user', content: `Topic the Founder wants to ask about: ${c.body.topic}` }], system });
      const a = r.text.indexOf('{'); const b = r.text.lastIndexOf('}');
      let parsed: unknown = null; try { parsed = JSON.parse(r.text.slice(a, b + 1)); } catch { parsed = null; }
      const ok = z.object({ title: z.string().trim().min(L.titleMin).max(L.titleMax), description: z.string().trim().min(L.descMin).max(L.descMax), options: z.array(z.string().trim().min(1).max(L.optionMax)).min(L.optionsMin).max(L.optionsMax) }).safeParse(parsed);
      if (!ok.success) throw new HttpError(502, 'ai_bad_output', 'The model’s answer wasn’t usable as a poll, so nothing was drafted. You can try again or write it yourself.');
      const seen = new Set<string>(); const options = ok.data.options.filter((o) => { const k = o.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      if (options.length < L.optionsMin) throw new HttpError(502, 'ai_bad_output', 'The model’s options weren’t distinct, so nothing was drafted.');
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'poll.ai_draft_requested', meta: { provider: r.provider } }, c.now());
      return { draft: { ...ok.data, options }, label: 'Written by an AI model. Check the wording is neutral and accurate, then edit freely before saving. Nothing has been saved.', provider: r.provider, saved: false };
    });
    router.post('/api/founder/polls/:id/publish', { auth: { perm: 'governance.manage' }, body: z.object({ closesAt: z.string().datetime(), opensAt: z.string().datetime().optional() }).strict() }, async (c) => {
      const p = await c.db.get<any>('SELECT * FROM gov_polls WHERE id = $1', [id.safeParse(c.params.id).data ?? '']); if (!p) throw notFound();
      if (p.status !== 'draft') throw conflict('Only a draft can be published.', 'not_draft');
      const closes = new Date(c.body.closesAt).getTime(); const now = c.now().getTime();
      const opens = c.body.opensAt ? new Date(c.body.opensAt).getTime() : now;
      if (c.body.opensAt) {
        if (opens < now + 5 * 60_000) throw conflict('Choose an opening time at least 5 minutes from now, or leave it empty to open now.', 'opens_too_soon');
        if (opens > now + L.maxScheduleDays * 86400_000) throw conflict(`A poll can be scheduled at most ${L.maxScheduleDays} days ahead.`, 'opens_too_far');
      }
      if (closes < opens + L.minHours * 3600_000) throw conflict(`Voting must stay open for at least ${L.minHours} hour after it opens.`, 'deadline_too_soon');
      if (closes < now + L.minHours * 3600_000) throw conflict(`Voting must stay open for at least ${L.minHours} hour.`, 'deadline_too_soon');
      if (closes > now + L.maxDays * 86400_000) throw conflict(`Voting can stay open for at most ${L.maxDays} days.`, 'deadline_too_far');
      await c.db.run("UPDATE gov_polls SET status = 'open', opened_at = $2, opens_at = $4, closes_at = $3 WHERE id = $1", [p.id, c.body.opensAt ?? c.now().toISOString(), c.body.closesAt, c.body.opensAt ?? null]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: c.body.opensAt ? 'poll.scheduled' : 'poll.published', targetType: 'poll', targetId: p.id, meta: { eligibility: p.eligibility, opensAt: c.body.opensAt ?? null, closesAt: c.body.closesAt } }, c.now());
      // Opening now: tell eligible people straight away when the audience is small; larger audiences are told by the next maintenance run (within minutes).
      if (!c.body.opensAt && (await eligibleCount(c.db, p)) <= 500) await announce(s, p.id, 'opened');
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
      await announce(s, p.id, 'decision');
      return { poll: await view(c.db, await c.db.get('SELECT * FROM gov_polls WHERE id = $1', [p.id]), c.me.userId, c.now()) };
    });
  },
};
