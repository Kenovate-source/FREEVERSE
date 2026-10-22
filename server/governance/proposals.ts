import type { Services } from '../services';
import type { Db } from '../db';
import { bool, json, uuid } from '../db';
import { ACTIONS, type Actor, type ExecCtx, type Risk } from './actions';
import { audit } from '../services/audit';
import type { AiMode } from '../../shared/constants';

/**
 * Sensitive-action approval workflow, shared by Founder AI proposals, specialist proposals and human appointments.
 * Authorization is decided HERE from the registry and the signed-in human, never from anything an AI or a stored row claims.
 */
export interface ProposalInput {
  source: 'founder-ai' | 'founder' | 'council' | string;
  requestedBy: string | null;
  actionType: string;
  payload: unknown;
  title: string;
  rationale?: string;
  evidence?: { label: string; value: string; kind: 'verified_fact' | 'observation' | 'assumption' | 'forecast' | 'suggestion' }[];
}
export class WorkflowError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

const event = (db: Db, proposalId: string, actorId: string | null, label: string, ev: string, note: string | null, now: Date) =>
  db.run('INSERT INTO proposal_events (id, proposal_id, actor_id, actor_label, event, note, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuid(), proposalId, actorId, label, ev, note, now.toISOString()]);

export async function founderAiSettings(db: Db): Promise<{ mode: AiMode; rules: any[] }> {
  const r = await db.get<any>('SELECT mode, autonomy_rules FROM founder_ai_settings WHERE id = 1');
  return { mode: (r?.mode ?? 'approval_required') as AiMode, rules: json<any[]>(r?.autonomy_rules, []) };
}

export async function createProposal(s: Services, input: ProposalInput) {
  const def = ACTIONS[input.actionType];
  if (!def) throw new WorkflowError(400, 'unknown_action', 'That kind of change is not one the system can make.');
  const parsed = def.schema.safeParse(input.payload);
  if (!parsed.success) throw new WorkflowError(400, 'invalid_payload', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  if (input.source === 'council' && input.actionType === 'governance.appoint') {
    const seat = await s.db.get<{ level: number }>('SELECT level FROM governance_seats WHERE id = $1', [(parsed.data as any).seatId]);
    if (!seat || seat.level <= 3) throw new WorkflowError(403, 'founder_only', 'Council seats are appointed personally by the Founder.');
  }
  const impact = await def.impact(s.db, parsed.data);
  let kind: 'change' | 'recommendation' = 'change';
  let advisoryNote: string | null = null;
  if (input.source === 'founder-ai' && (await founderAiSettings(s.db)).mode === 'advisory') { kind = 'recommendation'; advisoryNote = 'Founder AI is in Advisory mode: this is a recommendation only and cannot be executed through the AI.'; }
  const id = uuid(); const now = s.now();
  await s.db.tx(async (t) => {
    await t.run(
      `INSERT INTO proposals (id, source, kind, action_type, title, rationale, impact, evidence, payload, effective_risk, status, requested_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_approval',$11,$12,$12)`,
      [id, input.source, kind, input.actionType, input.title, input.rationale ?? '', { ...impact, risk: def.risk, riskWhy: def.riskWhy, autonomyEligible: def.autonomyEligible }, input.evidence ?? [], parsed.data, def.risk, input.requestedBy, now.toISOString()]);
    await event(t, id, input.requestedBy, input.source === 'founder-ai' ? 'Founder AI' : input.source, 'created', advisoryNote, now);
  });
  return { id, kind, risk: def.risk };
}

/** Runs the action and records the outcome. Re-derives risk from the registry; refuses anything the actor may not do. */
async function run(s: Services, proposalId: string, actor: Actor): Promise<'executed' | 'failed'> {
  const p = await s.db.get<any>('SELECT * FROM proposals WHERE id = $1', [proposalId]);
  if (!p) throw new WorkflowError(404, 'not_found', 'Proposal not found.');
  const def = ACTIONS[p.action_type];
  if (!def) throw new WorkflowError(400, 'unknown_action', 'Unknown action.');
  if (actor.kind === 'ai' && (def.risk !== 'low' || !def.autonomyEligible)) throw new WorkflowError(403, 'approval_required', 'This action always needs a human’s explicit approval.');
  const payload = def.schema.parse(json(p.payload, {}));
  const now = s.now();
  const ctx: ExecCtx = { s, db: s.db, now, actor };
  const who = actor.kind === 'human' ? actor.userId : null;
  const label = actor.kind === 'human' ? `${actor.role}` : 'Founder AI (bounded autonomy)';
  await s.db.run("UPDATE proposals SET status = 'executing', updated_at = $2 WHERE id = $1", [proposalId, now.toISOString()]);
  try {
    const out = await def.execute(ctx, payload);
    const ver = await def.verify(ctx, payload, out).catch((e) => ({ ok: false, detail: `Verification failed: ${e instanceof Error ? e.message : e}` }));
    await s.db.run("UPDATE proposals SET status = 'executed', executed_at = $2, execution_result = $3, rollback_data = $4, verification = $5, updated_at = $2, auto_executed = $6 WHERE id = $1",
      [proposalId, now.toISOString(), out.result, out.rollback ?? null, ver, actor.kind === 'ai']);
    await event(s.db, proposalId, who, label, ver.ok ? 'executed_verified' : 'executed_unverified', ver.detail, now);
    await audit(s.db, { actorId: who, actorRole: label, action: 'proposal.executed', targetType: 'proposal', targetId: proposalId, meta: { actionType: p.action_type, risk: def.risk, verified: ver.ok, auto: actor.kind === 'ai' } }, now);
    return 'executed';
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    await s.db.run("UPDATE proposals SET status = 'failed', execution_result = $2, updated_at = $3 WHERE id = $1", [proposalId, { error: msg }, now.toISOString()]);
    await event(s.db, proposalId, who, label, 'failed', msg, now);
    await audit(s.db, { actorId: who, actorRole: label, action: 'proposal.failed', targetType: 'proposal', targetId: proposalId, outcome: 'failed', meta: { actionType: p.action_type } }, now);
    return 'failed';
  }
}

/**
 * The Founder AI submits work. In bounded-autonomy mode ONLY a low-risk, autonomy-eligible action covered by an enabled, in-quota rule runs
 * itself; everything else waits for a human. Returns what happened so the AI can report it honestly.
 */
export async function submitFromAi(s: Services, input: Omit<ProposalInput, 'source' | 'requestedBy'>): Promise<{ id: string; outcome: 'pending_approval' | 'executed' | 'failed' | 'recommendation_only'; reason: string }> {
  const created = await createProposal(s, { ...input, source: 'founder-ai', requestedBy: null });
  if (created.kind === 'recommendation') return { id: created.id, outcome: 'recommendation_only', reason: 'Advisory mode: nothing executes.' };
  const { mode, rules } = await founderAiSettings(s.db);
  const def = ACTIONS[input.actionType]!;
  if (mode !== 'bounded_autonomy') return { id: created.id, outcome: 'pending_approval', reason: 'Approval required: waiting for the Founder.' };
  if (def.risk !== 'low' || !def.autonomyEligible) return { id: created.id, outcome: 'pending_approval', reason: def.risk === 'high' ? 'High-impact actions always need explicit approval.' : 'This action is outside what autonomy may do; it needs approval.' };
  const rule = rules.find((r) => r.enabled && r.actionType === input.actionType);
  if (!rule) return { id: created.id, outcome: 'pending_approval', reason: 'No enabled autonomy rule covers this action.' };
  const dayStart = new Date(s.now().getTime() - 24 * 3600_000).toISOString();
  const used = Number((await s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM proposals WHERE source = 'founder-ai' AND auto_executed = $1 AND action_type = $2 AND executed_at > $3", [true, input.actionType, dayStart]))?.n ?? 0);
  if (used >= Number(rule.maxPerDay)) return { id: created.id, outcome: 'pending_approval', reason: `The rule’s daily limit (${rule.maxPerDay}) is used up.` };
  await db_event(s, created.id, `Auto-run under rule “${rule.id}”`);
  const r = await run(s, created.id, { kind: 'ai', agentId: 'founder-ai', ruleId: rule.id });
  return { id: created.id, outcome: r, reason: `Ran under autonomy rule “${rule.id}”.` };
}
const db_event = (s: Services, id: string, note: string) => event(s.db, id, null, 'Founder AI', 'auto_authorised', note, s.now());

export type Decision = 'approve' | 'reject' | 'revise';
export async function decide(s: Services, proposalId: string, actor: { userId: string; role: string; canDecide: boolean }, decision: Decision, note: string | null): Promise<{ status: string }> {
  if (!actor.canDecide) throw new WorkflowError(403, 'permission_denied', 'You cannot decide proposals.');
  const p = await s.db.get<any>('SELECT * FROM proposals WHERE id = $1', [proposalId]);
  if (!p) throw new WorkflowError(404, 'not_found', 'Proposal not found.');
  if (p.status !== 'pending_approval' && !(p.status === 'revision_requested' && decision !== 'approve')) throw new WorkflowError(409, 'not_pending', 'This proposal is not waiting for a decision.');
  const now = s.now();
  if (decision === 'reject' || decision === 'revise') {
    const status = decision === 'reject' ? 'rejected' : 'revision_requested';
    await s.db.run('UPDATE proposals SET status = $2, decided_by = $3, decided_at = $4, decision_note = $5, updated_at = $4 WHERE id = $1', [proposalId, status, actor.userId, now.toISOString(), note]);
    await event(s.db, proposalId, actor.userId, actor.role, status, note, now);
    await audit(s.db, { actorId: actor.userId, actorRole: actor.role, action: `proposal.${status}`, targetType: 'proposal', targetId: proposalId, reason: note }, now);
    return { status };
  }
  await s.db.run("UPDATE proposals SET decided_by = $2, decided_at = $3, decision_note = $4, status = 'approved', updated_at = $3 WHERE id = $1", [proposalId, actor.userId, now.toISOString(), note]);
  await event(s.db, proposalId, actor.userId, actor.role, 'approved', note, now);
  await audit(s.db, { actorId: actor.userId, actorRole: actor.role, action: 'proposal.approved', targetType: 'proposal', targetId: proposalId, reason: note }, now);
  if (p.kind === 'recommendation') return { status: 'approved' }; // a recommendation is acknowledged, never executed
  return { status: await run(s, proposalId, { kind: 'human', userId: actor.userId, role: actor.role }) };
}

export async function rollback(s: Services, proposalId: string, actor: { userId: string; role: string; canDecide: boolean }): Promise<void> {
  if (!actor.canDecide) throw new WorkflowError(403, 'permission_denied', 'You cannot roll back proposals.');
  const p = await s.db.get<any>('SELECT * FROM proposals WHERE id = $1', [proposalId]);
  if (!p || p.status !== 'executed' || !p.rollback_data) throw new WorkflowError(409, 'not_rollbackable', 'This change cannot be rolled back.');
  const def = ACTIONS[p.action_type];
  if (!def?.rollback) throw new WorkflowError(409, 'not_rollbackable', 'This change cannot be rolled back.');
  const now = s.now();
  await def.rollback({ s, db: s.db, now, actor: { kind: 'human', userId: actor.userId, role: actor.role } }, json(p.rollback_data, {}));
  await s.db.run("UPDATE proposals SET status = 'rolled_back', updated_at = $2 WHERE id = $1", [proposalId, now.toISOString()]);
  await event(s.db, proposalId, actor.userId, actor.role, 'rolled_back', null, now);
  await audit(s.db, { actorId: actor.userId, actorRole: actor.role, action: 'proposal.rolled_back', targetType: 'proposal', targetId: proposalId, meta: { actionType: p.action_type } }, now);
}

export const riskOf = (type: string): Risk | null => ACTIONS[type]?.risk ?? null;
void bool;
