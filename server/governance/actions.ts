import { z, type ZodType } from 'zod';
import type { Services } from '../services';
import type { Db } from '../db';
import { json, uuid } from '../db';
import { AI_MODES } from '../../shared/constants';
import { UNIVERSES } from '../../shared/universes';
import { notify } from '../services/notify';
import { aiApi } from '../ai/runtime';
import { setAgentEnabled } from '../ai/registry';
import { audit } from '../services/audit';

/**
 * The code-defined action registry. THE RISK OF AN ACTION IS FIXED HERE. A proposal row, an AI, or a request body can never
 * declare its own risk: the engine always re-reads it from this file at the moment of decision or execution.
 *
 * Rules the engine enforces from this registry:
 *  - high-risk actions ALWAYS need a human's explicit approval (plus step-up re-authentication), in every autonomy mode;
 *  - only low-risk actions flagged autonomyEligible can ever run without approval, and only under founder-configured rules;
 *  - everything records who/what executed it, what changed, how it was verified and how to roll it back.
 */
export type Risk = 'low' | 'medium' | 'high';
export type Actor = { kind: 'human'; userId: string; role: string } | { kind: 'ai'; agentId: string; ruleId: string };
export interface ExecCtx { s: Services; db: Db; now: Date; actor: Actor }
export interface ExecOutcome { result: Record<string, unknown>; rollback?: Record<string, unknown> }
export interface Impact { summary: string; affects: string[]; reversible: boolean }

export interface ActionDef<P = any> {
  type: string;
  label: string;
  risk: Risk;
  /** Plain reason the risk is what it is. */
  riskWhy: string;
  autonomyEligible: boolean;
  schema: ZodType<P>;
  impact(db: Db, p: P): Promise<Impact>;
  execute(c: ExecCtx, p: P): Promise<ExecOutcome>;
  rollback?(c: ExecCtx, data: Record<string, unknown>): Promise<void>;
  verify(c: ExecCtx, p: P, out: ExecOutcome): Promise<{ ok: boolean; detail: string }>;
}

const id = z.string().uuid();
const LEVEL_ROLE: Record<number, string> = { 3: 'council', 7: 'high_council', 12: 'director', 24: 'guardian' };
const actorId = (a: Actor): string | null => (a.kind === 'human' ? a.userId : null);

async function founderId(db: Db): Promise<string | null> {
  return (await db.get<{ user_id: string }>("SELECT user_id FROM role_grants WHERE role = 'founder' AND revoked_at IS NULL"))?.user_id ?? null;
}
const cfgSet = (db: Db, key: string, value: unknown, by: string | null, now: Date) =>
  db.run('INSERT INTO platform_config (key, value, updated_by, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at', [key, value, by, now.toISOString()]);
export const cfgGet = async <T>(db: Db, key: string, fallback: T): Promise<T> => json<T>((await db.get<{ value: unknown }>('SELECT value FROM platform_config WHERE key = $1', [key]))?.value, fallback);

const appointSchema = z.object({ seatId: id, userId: id, reason: z.string().trim().min(10).max(400) }).strict();
const appoint: ActionDef<z.infer<typeof appointSchema>> = {
  type: 'governance.appoint', label: 'Appoint someone to a governance seat', risk: 'high', riskWhy: 'Changes who holds governance authority.', autonomyEligible: false, schema: appointSchema,
  async impact(db, p) {
    const seat = await db.get<any>('SELECT level, seat_no, title FROM governance_seats WHERE id = $1', [p.seatId]);
    const u = await db.get<any>('SELECT handle, display_name FROM users WHERE id = $1', [p.userId]);
    return { summary: `Appoint ${u?.display_name ?? 'a member'} (@${u?.handle ?? '?'}) to ${seat?.title ?? 'a seat'} (level ${seat?.level}). They receive that level’s permissions, which do not include access to anyone’s private messages, journals or Nova conversations.`, affects: ['Governance seat', 'Role grants', 'Audit log'], reversible: true };
  },
  async execute(c, p) {
    const seat = await c.db.get<any>('SELECT * FROM governance_seats WHERE id = $1', [p.seatId]);
    if (!seat) throw new Error('That seat does not exist.');
    if (seat.level === 1) throw new Error('The Founder seat cannot be filled by appointment.');
    if (seat.holder_user_id) throw new Error('That seat is already held. Remove the current holder first.');
    const u = await c.db.get<any>("SELECT status FROM users WHERE id = $1", [p.userId]);
    if (!u || u.status !== 'active') throw new Error('Only an active member can be appointed.');
    const held = await c.db.get("SELECT 1 AS x FROM role_grants WHERE user_id = $1 AND revoked_at IS NULL AND seat_id IS NOT NULL", [p.userId]);
    if (held) throw new Error('This person already holds a seat. A person holds one governance seat at a time.');
    const grantId = uuid(); const iso = c.now.toISOString();
    await c.db.tx(async (t) => {
      await t.run('INSERT INTO role_grants (id, user_id, role, seat_id, granted_by, granted_at, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)', [grantId, p.userId, LEVEL_ROLE[seat.level], p.seatId, actorId(c.actor), iso, p.reason]);
      await t.run('UPDATE governance_seats SET holder_user_id = $2, appointed_by = $3, appointed_at = $4, updated_at = $4 WHERE id = $1', [p.seatId, p.userId, actorId(c.actor), iso]);
      await notify(t, { userId: p.userId, type: 'system', data: { text: `You were appointed to ${seat.title}. Open Governance to see what this does and does not allow.`, href: '#/governance' } }, c.now);
    });
    return { result: { grantId, role: LEVEL_ROLE[seat.level] }, rollback: { grantId, seatId: p.seatId } };
  },
  async rollback(c, d) {
    const iso = c.now.toISOString();
    await c.db.run("UPDATE role_grants SET revoked_at = $2, revoked_by = $3, revoked_reason = 'rolled back' WHERE id = $1 AND revoked_at IS NULL", [d.grantId, iso, actorId(c.actor)]);
    await c.db.run('UPDATE governance_seats SET holder_user_id = NULL, appointed_by = NULL, appointed_at = NULL, updated_at = $2 WHERE id = $1', [d.seatId, iso]);
  },
  async verify(c, p) {
    const s = await c.db.get<any>('SELECT holder_user_id FROM governance_seats WHERE id = $1', [p.seatId]);
    const g = await c.db.get('SELECT 1 AS x FROM role_grants WHERE user_id = $1 AND seat_id = $2 AND revoked_at IS NULL', [p.userId, p.seatId]);
    return { ok: s?.holder_user_id === p.userId && !!g, detail: 'Seat holder and live role grant re-read from the database.' };
  },
};

const removeSchema = z.object({ seatId: id, reason: z.string().trim().min(10).max(400) }).strict();
const remove: ActionDef<z.infer<typeof removeSchema>> = {
  type: 'governance.remove', label: 'Remove someone from a governance seat', risk: 'high', riskWhy: 'Changes who holds governance authority.', autonomyEligible: false, schema: removeSchema,
  async impact(db, p) {
    const seat = await db.get<any>('SELECT s.title, s.level, u.display_name, u.handle FROM governance_seats s LEFT JOIN users u ON u.id = s.holder_user_id WHERE s.id = $1', [p.seatId]);
    return { summary: `Remove ${seat?.display_name ?? 'the current holder'} (@${seat?.handle ?? '?'}) from ${seat?.title}. Their governance permissions end immediately; their account and content are unaffected.`, affects: ['Governance seat', 'Role grants', 'Audit log'], reversible: true };
  },
  async execute(c, p) {
    const seat = await c.db.get<any>('SELECT * FROM governance_seats WHERE id = $1', [p.seatId]);
    if (!seat || !seat.holder_user_id) throw new Error('That seat has no holder.');
    if (seat.level === 1) throw new Error('The Founder seat cannot be removed this way.');
    const grant = await c.db.get<any>('SELECT id FROM role_grants WHERE seat_id = $1 AND revoked_at IS NULL', [p.seatId]);
    const iso = c.now.toISOString();
    await c.db.tx(async (t) => {
      if (grant) await t.run('UPDATE role_grants SET revoked_at = $2, revoked_by = $3, revoked_reason = $4 WHERE id = $1', [grant.id, iso, actorId(c.actor), p.reason]);
      await t.run('UPDATE governance_seats SET holder_user_id = NULL, appointed_by = NULL, appointed_at = NULL, updated_at = $2 WHERE id = $1', [p.seatId, iso]);
    });
    return { result: { removedUserId: seat.holder_user_id }, rollback: { seatId: p.seatId, userId: seat.holder_user_id, role: LEVEL_ROLE[seat.level], appointedBy: seat.appointed_by } };
  },
  async rollback(c, d) {
    const iso = c.now.toISOString();
    await c.db.run('INSERT INTO role_grants (id, user_id, role, seat_id, granted_by, granted_at, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuid(), d.userId, d.role, d.seatId, actorId(c.actor), iso, 'restored by rollback']);
    await c.db.run('UPDATE governance_seats SET holder_user_id = $2, appointed_by = $3, appointed_at = $4, updated_at = $4 WHERE id = $1', [d.seatId, d.userId, actorId(c.actor), iso]);
  },
  async verify(c, p) { const s = await c.db.get<any>('SELECT holder_user_id FROM governance_seats WHERE id = $1', [p.seatId]); return { ok: !s?.holder_user_id, detail: 'Seat re-read: it is vacant.' }; },
};

const seatSchema = z.object({ seatId: id, title: z.string().trim().min(2).max(60), responsibilities: z.string().trim().max(600).nullable().default(null) }).strict();
const seatUpdate: ActionDef<z.infer<typeof seatSchema>> = {
  type: 'governance.seat_update', label: 'Rename a seat or change its responsibilities', risk: 'high', riskWhy: 'Defines governance responsibilities (a constitutional matter).', autonomyEligible: false, schema: seatSchema,
  async impact(db, p) { const s = await db.get<any>('SELECT title FROM governance_seats WHERE id = $1', [p.seatId]); return { summary: `Rename “${s?.title}” to “${p.title}” and set its responsibilities text.`, affects: ['Governance seat'], reversible: true }; },
  async execute(c, p) {
    const s = await c.db.get<any>('SELECT title, responsibilities FROM governance_seats WHERE id = $1', [p.seatId]);
    if (!s) throw new Error('That seat does not exist.');
    await c.db.run('UPDATE governance_seats SET title = $2, responsibilities = $3, updated_at = $4 WHERE id = $1', [p.seatId, p.title, p.responsibilities, c.now.toISOString()]);
    return { result: {}, rollback: { seatId: p.seatId, title: s.title, responsibilities: s.responsibilities } };
  },
  async rollback(c, d) { await c.db.run('UPDATE governance_seats SET title = $2, responsibilities = $3, updated_at = $4 WHERE id = $1', [d.seatId, d.title, d.responsibilities, c.now.toISOString()]); },
  async verify(c, p) { const s = await c.db.get<any>('SELECT title FROM governance_seats WHERE id = $1', [p.seatId]); return { ok: s?.title === p.title, detail: 'Seat title re-read.' }; },
};

const modSchema = z.object({ userId: id, reason: z.string().trim().min(10).max(400) }).strict();
const modGrant: ActionDef<z.infer<typeof modSchema>> = {
  type: 'roles.moderator_grant', label: 'Grant the moderator role', risk: 'high', riskWhy: 'A security-sensitive permission change: moderators can review reported content with a recorded reason.', autonomyEligible: false, schema: modSchema,
  async impact(db, p) { const u = await db.get<any>('SELECT display_name, handle FROM users WHERE id = $1', [p.userId]); return { summary: `Make ${u?.display_name} (@${u?.handle}) a moderator. They can see the moderation queue (no content), and read a reported item’s frozen snapshot only after writing a reason; every access is audited. They cannot read private messages, journals or Nova conversations.`, affects: ['Role grants', 'Audit log'], reversible: true }; },
  async execute(c, p) {
    const u = await c.db.get<any>('SELECT status FROM users WHERE id = $1', [p.userId]);
    if (!u || u.status !== 'active') throw new Error('Only an active member can become a moderator.');
    if (await c.db.get("SELECT 1 AS x FROM role_grants WHERE user_id = $1 AND role = 'moderator' AND revoked_at IS NULL", [p.userId])) throw new Error('They are already a moderator.');
    const gid = uuid();
    await c.db.run("INSERT INTO role_grants (id, user_id, role, granted_by, granted_at, reason) VALUES ($1,$2,'moderator',$3,$4,$5)", [gid, p.userId, actorId(c.actor), c.now.toISOString(), p.reason]);
    return { result: { grantId: gid }, rollback: { grantId: gid } };
  },
  async rollback(c, d) { await c.db.run("UPDATE role_grants SET revoked_at = $2, revoked_reason = 'rolled back' WHERE id = $1 AND revoked_at IS NULL", [d.grantId, c.now.toISOString()]); },
  async verify(c, p) { const g = await c.db.get("SELECT 1 AS x FROM role_grants WHERE user_id = $1 AND role = 'moderator' AND revoked_at IS NULL", [p.userId]); return { ok: !!g, detail: 'Live grant re-read.' }; },
};
const modRevoke: ActionDef<z.infer<typeof modSchema>> = {
  type: 'roles.moderator_revoke', label: 'Revoke the moderator role', risk: 'high', riskWhy: 'A security-sensitive permission change.', autonomyEligible: false, schema: modSchema,
  async impact(db, p) { const u = await db.get<any>('SELECT display_name, handle FROM users WHERE id = $1', [p.userId]); return { summary: `Remove moderator access from ${u?.display_name} (@${u?.handle}).`, affects: ['Role grants'], reversible: true }; },
  async execute(c, p) {
    const g = await c.db.get<any>("SELECT id FROM role_grants WHERE user_id = $1 AND role = 'moderator' AND revoked_at IS NULL", [p.userId]);
    if (!g) throw new Error('They are not a moderator.');
    await c.db.run('UPDATE role_grants SET revoked_at = $2, revoked_by = $3, revoked_reason = $4 WHERE id = $1', [g.id, c.now.toISOString(), actorId(c.actor), p.reason]);
    return { result: {}, rollback: { userId: p.userId } };
  },
  async rollback(c, d) { await c.db.run("INSERT INTO role_grants (id, user_id, role, granted_by, granted_at, reason) VALUES ($1,$2,'moderator',$3,$4,'restored by rollback')", [uuid(), d.userId, actorId(c.actor), c.now.toISOString()]); },
  async verify(c, p) { const g = await c.db.get("SELECT 1 AS x FROM role_grants WHERE user_id = $1 AND role = 'moderator' AND revoked_at IS NULL", [p.userId]); return { ok: !g, detail: 'No live moderator grant remains.' }; },
};

const grantRevokeSchema = z.object({ grantId: id, reason: z.string().trim().min(10).max(400) }).strict();
const grantRevoke: ActionDef<z.infer<typeof grantRevokeSchema>> = {
  type: 'access_review.revoke', label: 'Revoke a role grant found in an access review', risk: 'high', riskWhy: 'A security-sensitive permission change.', autonomyEligible: false, schema: grantRevokeSchema,
  async impact(db, p) { const g = await db.get<any>('SELECT g.role, u.display_name, u.handle FROM role_grants g JOIN users u ON u.id = g.user_id WHERE g.id = $1', [p.grantId]); return { summary: `Revoke the ${g?.role} role from ${g?.display_name} (@${g?.handle}).`, affects: ['Role grants', 'Governance seat if any'], reversible: true }; },
  async execute(c, p) {
    const g = await c.db.get<any>('SELECT * FROM role_grants WHERE id = $1 AND revoked_at IS NULL', [p.grantId]);
    if (!g) throw new Error('That grant is not live.');
    if (g.role === 'founder') throw new Error('The Founder role cannot be revoked this way.');
    await c.db.tx(async (t) => {
      await t.run('UPDATE role_grants SET revoked_at = $2, revoked_by = $3, revoked_reason = $4 WHERE id = $1', [g.id, c.now.toISOString(), actorId(c.actor), p.reason]);
      if (g.seat_id) await t.run('UPDATE governance_seats SET holder_user_id = NULL, appointed_by = NULL, appointed_at = NULL, updated_at = $2 WHERE id = $1', [g.seat_id, c.now.toISOString()]);
    });
    return { result: { role: g.role }, rollback: { userId: g.user_id, role: g.role, seatId: g.seat_id } };
  },
  async rollback(c, d) {
    await c.db.run('INSERT INTO role_grants (id, user_id, role, seat_id, granted_by, granted_at, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuid(), d.userId, d.role, d.seatId ?? null, actorId(c.actor), c.now.toISOString(), 'restored by rollback']);
    if (d.seatId) await c.db.run('UPDATE governance_seats SET holder_user_id = $2, updated_at = $3 WHERE id = $1', [d.seatId, d.userId, c.now.toISOString()]);
  },
  async verify(c, p) { const g = await c.db.get('SELECT 1 AS x FROM role_grants WHERE id = $1 AND revoked_at IS NULL', [p.grantId]); return { ok: !g, detail: 'Grant re-read: it is no longer live.' }; },
};

const retSchema = z.object({ days: z.number().int().min(1).max(365) }).strict();
const retention: ActionDef<z.infer<typeof retSchema>> = {
  type: 'config.flag_retention', label: 'Change retention of flagged Nova excerpts', risk: 'high', riskWhy: 'A material privacy change. The retention period is disclosed to members.', autonomyEligible: false, schema: retSchema,
  async impact(db, p) { return { summary: `Flagged Nova excerpts will be kept for ${p.days} days (currently ${await cfgGet<number>(db, 'nova.flag_retention_days', 30)}). Applies to NEW flags; the disclosure shown to members updates automatically.`, affects: ['Nova safety', 'Member disclosure'], reversible: true }; },
  async execute(c, p) { const prev = await cfgGet<number>(c.db, 'nova.flag_retention_days', 30); await cfgSet(c.db, 'nova.flag_retention_days', p.days, actorId(c.actor), c.now); return { result: { days: p.days }, rollback: { days: prev } }; },
  async rollback(c, d) { await cfgSet(c.db, 'nova.flag_retention_days', d.days, actorId(c.actor), c.now); },
  async verify(c, p) { return { ok: (await cfgGet<number>(c.db, 'nova.flag_retention_days', 30)) === p.days, detail: 'Configuration re-read.' }; },
};

const anonSchema = z.object({ slug: z.string().min(2).max(48), allow: z.boolean(), reason: z.string().trim().min(10).max(300) }).strict();
const anonymous: ActionDef<z.infer<typeof anonSchema>> = {
  type: 'community.anonymous_set', label: 'Allow or forbid anonymous posting in a community', risk: 'high', riskWhy: 'A material privacy and safety change.', autonomyEligible: false, schema: anonSchema,
  async impact(db, p) { const c = await db.get<any>('SELECT name FROM communities WHERE slug = $1', [p.slug]); return { summary: `${p.allow ? 'Allow' : 'Forbid'} anonymous posts and comments in ${c?.name}. Authors stay recorded for moderation either way.`, affects: ['Community'], reversible: true }; },
  async execute(c, p) {
    if (p.allow && !c.s.config.anonymousPostingEnabled) throw new Error('Anonymous posting is switched off for this deployment.');
    const row = await c.db.get<any>('SELECT id, allow_anonymous FROM communities WHERE slug = $1', [p.slug]);
    if (!row) throw new Error('That community does not exist.');
    await c.db.run('UPDATE communities SET allow_anonymous = $2 WHERE id = $1', [row.id, p.allow]);
    return { result: {}, rollback: { id: row.id, allow: row.allow_anonymous === true || row.allow_anonymous === 1 } };
  },
  async rollback(c, d) { await c.db.run('UPDATE communities SET allow_anonymous = $2 WHERE id = $1', [d.id, d.allow]); },
  async verify(c, p) { const r = await c.db.get<any>('SELECT allow_anonymous FROM communities WHERE slug = $1', [p.slug]); return { ok: (r?.allow_anonymous === true || r?.allow_anonymous === 1) === p.allow, detail: 'Community re-read.' }; },
};

const UNI_IDS = UNIVERSES.map((u) => u.id) as [string, ...string[]];
const uniSchema = z.object({ universeId: z.enum(UNI_IDS), status: z.enum(['available', 'partial', 'planned_v2', 'planned_v3', 'concept', 'under_review']), note: z.string().trim().max(300).default('') }).strict();
const universe: ActionDef<z.infer<typeof uniSchema>> = {
  type: 'universe.set_status', label: 'Change a Universe’s published status', risk: 'medium', riskWhy: 'Changes what members are told is available.', autonomyEligible: false, schema: uniSchema,
  async impact(db, p) { return { summary: `Set ${p.universeId} to “${p.status}”. This changes the status members see on the Universes page. It does not build or remove anything.`, affects: ['Universes page'], reversible: true }; },
  async execute(c, p) { const cur = await cfgGet<Record<string, unknown>>(c.db, 'universes.status', {}); await cfgSet(c.db, 'universes.status', { ...cur, [p.universeId]: { status: p.status, note: p.note } }, actorId(c.actor), c.now); return { result: {}, rollback: { previous: cur } }; },
  async rollback(c, d) { await cfgSet(c.db, 'universes.status', d.previous, actorId(c.actor), c.now); },
  async verify(c, p) { const cur = await cfgGet<any>(c.db, 'universes.status', {}); return { ok: cur[p.universeId]?.status === p.status, detail: 'Configuration re-read.' }; },
};

const constSchema = z.object({ title: z.string().trim().min(3).max(120), summary: z.string().trim().min(10).max(600), text: z.string().trim().min(20).max(20000) }).strict();
const amend: ActionDef<z.infer<typeof constSchema>> = {
  type: 'constitution.amend', label: 'Record a constitutional amendment', risk: 'high', riskWhy: 'A constitutional change.', autonomyEligible: false, schema: constSchema,
  async impact(_db, p) { return { summary: `Add amendment “${p.title}” to the constitutional record. This records the decision; legal and community processes outside this app still apply.`, affects: ['Constitution record', 'Audit log'], reversible: true }; },
  async execute(c, p) {
    const cur = await cfgGet<any[]>(c.db, 'constitution.amendments', []);
    const entry = { id: uuid(), number: cur.length + 1, title: p.title, summary: p.summary, text: p.text, adoptedAt: c.now.toISOString(), adoptedBy: actorId(c.actor) };
    await cfgSet(c.db, 'constitution.amendments', [...cur, entry], actorId(c.actor), c.now);
    return { result: { amendmentId: entry.id, number: entry.number }, rollback: { previous: cur } };
  },
  async rollback(c, d) { await cfgSet(c.db, 'constitution.amendments', d.previous, actorId(c.actor), c.now); },
  async verify(c, _p, out) { const cur = await cfgGet<any[]>(c.db, 'constitution.amendments', []); return { ok: cur.some((x) => x.id === out.result.amendmentId), detail: 'Amendment record re-read.' }; },
};

const modeSchema = z.object({ mode: z.enum(AI_MODES), reason: z.string().trim().min(10).max(300) }).strict();
const setMode: ActionDef<z.infer<typeof modeSchema>> = {
  type: 'ai.set_mode', label: 'Change the Founder AI’s mode', risk: 'high', riskWhy: 'Changes the boundaries of the AI itself.', autonomyEligible: false, schema: modeSchema,
  async impact(db, p) { const m = (await db.get<any>('SELECT mode FROM founder_ai_settings WHERE id = 1'))?.mode; return { summary: `Switch the Founder AI from “${m}” to “${p.mode}”. ${p.mode === 'advisory' ? 'It will only recommend; nothing it prepares can be executed.' : p.mode === 'approval_required' ? 'It prepares changes and waits for your explicit approval.' : 'It may run ONLY routine low-risk actions that match rules you configured; everything else still needs your approval, and high-impact actions always do.'}`, affects: ['Founder AI'], reversible: true }; },
  async execute(c, p) { const prev = (await c.db.get<any>('SELECT mode FROM founder_ai_settings WHERE id = 1'))?.mode; await c.db.run('UPDATE founder_ai_settings SET mode = $1, updated_by = $2, updated_at = $3 WHERE id = 1', [p.mode, actorId(c.actor), c.now.toISOString()]); return { result: { mode: p.mode }, rollback: { mode: prev } }; },
  async rollback(c, d) { await c.db.run('UPDATE founder_ai_settings SET mode = $1, updated_at = $2 WHERE id = 1', [d.mode, c.now.toISOString()]); },
  async verify(c, p) { return { ok: (await c.db.get<any>('SELECT mode FROM founder_ai_settings WHERE id = 1'))?.mode === p.mode, detail: 'Settings re-read.' }; },
};

export const RULE_ACTIONS = ['finding.acknowledge', 'founder.notify', 'ai.health_check'] as const;
const ruleSchema = z.object({ rules: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{3,40}$/), actionType: z.enum(RULE_ACTIONS), maxPerDay: z.number().int().min(1).max(50), enabled: z.boolean(), note: z.string().max(200).default('') }).strict()).max(10), reason: z.string().trim().min(10).max(300) }).strict();
const setRules: ActionDef<z.infer<typeof ruleSchema>> = {
  type: 'ai.set_rules', label: 'Change the Founder AI’s autonomy rules', risk: 'high', riskWhy: 'Changes the boundaries of the AI itself.', autonomyEligible: false, schema: ruleSchema,
  async impact(_db, p) { return { summary: `Set ${p.rules.length} autonomy rule(s): ${p.rules.map((r) => `${r.actionType} ≤${r.maxPerDay}/day${r.enabled ? '' : ' (off)'}`).join(', ') || 'none'}. Rules can only name routine low-risk actions; they never apply in Advisory or Approval-required mode.`, affects: ['Founder AI'], reversible: true }; },
  async execute(c, p) { const prev = (await c.db.get<any>('SELECT autonomy_rules FROM founder_ai_settings WHERE id = 1'))?.autonomy_rules; await c.db.run('UPDATE founder_ai_settings SET autonomy_rules = $1, updated_by = $2, updated_at = $3 WHERE id = 1', [p.rules, actorId(c.actor), c.now.toISOString()]); return { result: { rules: p.rules.length }, rollback: { rules: json(prev, []) } }; },
  async rollback(c, d) { await c.db.run('UPDATE founder_ai_settings SET autonomy_rules = $1, updated_at = $2 WHERE id = 1', [d.rules, c.now.toISOString()]); },
  async verify(c, p) { const r = json<any[]>((await c.db.get<any>('SELECT autonomy_rules FROM founder_ai_settings WHERE id = 1'))?.autonomy_rules, []); return { ok: r.length === p.rules.length, detail: 'Settings re-read.' }; },
};

const agentSchema = z.object({ agentId: z.string().max(40), enabled: z.boolean(), reason: z.string().trim().min(5).max(300) }).strict();
const agentToggle: ActionDef<z.infer<typeof agentSchema>> = {
  type: 'ai.agent_enabled', label: 'Switch a specialist on or off', risk: 'medium', riskWhy: 'Changes which AI specialists members can use.', autonomyEligible: false, schema: agentSchema,
  async impact(_db, p) { return { summary: `${p.enabled ? 'Enable' : 'Disable'} the ${p.agentId} specialist for members.`, affects: ['AI Council'], reversible: true }; },
  async execute(c, p) {
    if (p.agentId === 'founder-ai') throw new Error('The Founder AI is managed through its mode and rules.');
    const a = await aiApi.getAgent(c.s, p.agentId); if (!a) throw new Error('Unknown specialist.');
    await setAgentEnabled(c.s, p.agentId, p.enabled, actorId(c.actor) ?? 'system', p.reason);
    return { result: {}, rollback: { agentId: p.agentId, enabled: a.enabled } };
  },
  async rollback(c, d) { await setAgentEnabled(c.s, String(d.agentId), !!d.enabled, actorId(c.actor) ?? 'system', 'rolled back'); },
  async verify(c, p) { return { ok: (await aiApi.getAgent(c.s, p.agentId))?.enabled === p.enabled, detail: 'Specialist re-read.' }; },
};

// ───── low-risk, autonomy-eligible routine actions ─────
const findSchema = z.object({ findingId: id }).strict();
const ackFinding: ActionDef<z.infer<typeof findSchema>> = {
  type: 'finding.acknowledge', label: 'Mark a finding as seen', risk: 'low', riskWhy: 'Only changes a label on the AI’s own notes.', autonomyEligible: true, schema: findSchema,
  async impact() { return { summary: 'Mark one finding as acknowledged. It stays visible and can be reopened.', affects: ['Founder AI findings'], reversible: true }; },
  async execute(c, p) { const r = await c.db.run("UPDATE founder_ai_findings SET status = 'acknowledged', updated_at = $2 WHERE id = $1 AND status = 'open'", [p.findingId, c.now.toISOString()]); if (!r.changes) throw new Error('That finding is not open.'); return { result: {}, rollback: { findingId: p.findingId } }; },
  async rollback(c, d) { await c.db.run("UPDATE founder_ai_findings SET status = 'open', updated_at = $2 WHERE id = $1", [d.findingId, c.now.toISOString()]); },
  async verify(c, p) { return { ok: (await c.db.get<any>('SELECT status FROM founder_ai_findings WHERE id = $1', [p.findingId]))?.status === 'acknowledged', detail: 'Finding re-read.' }; },
};
const notifySchema = z.object({ text: z.string().trim().min(3).max(300) }).strict();
const notifyFounder: ActionDef<z.infer<typeof notifySchema>> = {
  type: 'founder.notify', label: 'Send the Founder a notification', risk: 'low', riskWhy: 'Only notifies the Founder.', autonomyEligible: true, schema: notifySchema,
  async impact() { return { summary: 'Add one in-app notification for the Founder.', affects: ['Founder notifications'], reversible: false }; },
  async execute(c, p) { const f = await founderId(c.db); if (!f) throw new Error('There is no Founder account yet.'); await notify(c.db, { userId: f, type: 'system', data: { text: p.text, href: '#/founder' } }, c.now); return { result: {} }; },
  async verify() { return { ok: true, detail: 'Notification written (the Founder’s settings may mute system notices).' }; },
};
const healthSchema = z.object({ agentId: z.string().max(40) }).strict();
const healthCheck: ActionDef<z.infer<typeof healthSchema>> = {
  type: 'ai.health_check', label: 'Run an AI health check', risk: 'low', riskWhy: 'Read-only round-trip to the provider.', autonomyEligible: true, schema: healthSchema,
  async impact() { return { summary: 'Make one tiny test call to the configured AI provider (nothing is sent about any person).', affects: ['AI Council'], reversible: false }; },
  async execute(c, p) { const r = await aiApi.checkHealth(c.s, p.agentId); return { result: { ok: r.ok, detail: r.detail } }; },
  async verify(_c, _p, out) { return { ok: true, detail: String(out.result.detail) }; },
};

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries([appoint, remove, seatUpdate, modGrant, modRevoke, grantRevoke, retention, anonymous, universe, amend, setMode, setRules, agentToggle, ackFinding, notifyFounder, healthCheck].map((a) => [a.type, a as ActionDef]));
export const actionList = () => Object.values(ACTIONS).map((a) => ({ type: a.type, label: a.label, risk: a.risk, riskWhy: a.riskWhy, autonomyEligible: a.autonomyEligible }));
void audit;
