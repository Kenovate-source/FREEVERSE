/**
 * Founder AI work lifecycle: ask → plan → propose → decide → execute → complete.
 * Derived ONLY from fields the system already records (proposal row, its events and a linked finding).
 * Nothing here is invented: a stage with no record behind it is shown as "waiting" or "not applicable".
 */
export const LIFECYCLE_KEYS = ['ask', 'plan', 'propose', 'decide', 'execute', 'complete'] as const;
export type LifecycleKey = (typeof LIFECYCLE_KEYS)[number];
export type StageState = 'done' | 'current' | 'waiting' | 'skipped' | 'stopped' | 'failed';
export interface LifecycleStage { key: LifecycleKey; label: string; state: StageState; at: string | null; note: string }
export interface LifecycleInput {
  status: string; kind: string; source: string; createdAt: string; decidedAt?: string | null; decisionNote?: string | null;
  executedAt?: string | null; autoExecuted?: boolean; rationale?: string; hasImpact?: boolean; verification?: unknown;
  findingTitle?: string | null;
}
const LABEL: Record<LifecycleKey, string> = { ask: 'Ask', plan: 'Plan', propose: 'Propose', decide: 'Decide', execute: 'Execute', complete: 'Complete' };

export function lifecycleOf(p: LifecycleInput): LifecycleStage[] {
  const st = (key: LifecycleKey, state: StageState, at: string | null, note: string): LifecycleStage => ({ key, label: LABEL[key], state, at, note });
  const out: LifecycleStage[] = [];
  out.push(st('ask', 'done', p.createdAt, p.findingTitle ? `Raised from finding: ${p.findingTitle}` : p.source === 'founder-ai' ? 'Prepared by Founder AI' : p.source === 'founder' ? 'Requested by you' : `Raised by ${p.source}`));
  out.push(st('plan', p.rationale || p.hasImpact ? 'done' : 'waiting', p.createdAt, p.rationale ? 'Reasoning and impact recorded' : 'No written reasoning was recorded'));
  out.push(st('propose', 'done', p.createdAt, p.kind === 'recommendation' ? 'Recommendation only: cannot be executed through the AI' : 'Change proposed'));
  const s = p.status;
  const decided = ['approved', 'executing', 'executed', 'failed', 'rolled_back'].includes(s);
  if (p.kind === 'recommendation') {
    out.push(st('decide', s === 'approved' ? 'done' : s === 'rejected' ? 'stopped' : 'current', p.decidedAt ?? null, s === 'approved' ? 'Acknowledged' : s === 'rejected' ? 'Rejected' : 'Waiting for you'));
    out.push(st('execute', 'skipped', null, 'A recommendation is never executed'));
    out.push(st('complete', s === 'approved' ? 'done' : 'skipped', p.decidedAt ?? null, s === 'approved' ? 'Acknowledged on record' : 'Nothing to complete'));
    return out;
  }
  if (p.autoExecuted) out.push(st('decide', 'skipped', p.executedAt ?? null, 'Ran on its own inside your bounded-autonomy rules'));
  else if (decided) out.push(st('decide', 'done', p.decidedAt ?? null, p.decisionNote ? `Approved: ${p.decisionNote}` : 'Approved'));
  else if (s === 'rejected') out.push(st('decide', 'stopped', p.decidedAt ?? null, p.decisionNote ? `Rejected: ${p.decisionNote}` : 'Rejected'));
  else if (s === 'revision_requested') out.push(st('decide', 'stopped', p.decidedAt ?? null, p.decisionNote ? `Revision requested: ${p.decisionNote}` : 'Revision requested'));
  else if (s === 'cancelled') out.push(st('decide', 'stopped', null, 'Cancelled'));
  else out.push(st('decide', 'current', null, 'Waiting for your decision'));
  const stopped = ['rejected', 'revision_requested', 'cancelled'].includes(s);
  if (stopped) { out.push(st('execute', 'skipped', null, 'Not run')); out.push(st('complete', 'skipped', null, 'Not run')); return out; }
  if (s === 'executed' || s === 'rolled_back') out.push(st('execute', 'done', p.executedAt ?? null, 'Executed'));
  else if (s === 'executing') out.push(st('execute', 'current', null, 'Running'));
  else if (s === 'failed') out.push(st('execute', 'failed', p.executedAt ?? null, 'Failed; nothing was changed'));
  else out.push(st('execute', 'waiting', null, 'Not started'));
  if (s === 'rolled_back') out.push(st('complete', 'stopped', null, 'Rolled back after running'));
  else if (s === 'executed') out.push(st('complete', p.verification ? 'done' : 'current', p.executedAt ?? null, p.verification ? 'Executed and checked afterwards' : 'Executed; no after-check was recorded'));
  else if (s === 'failed') out.push(st('complete', 'failed', null, 'Did not complete'));
  else out.push(st('complete', 'waiting', null, 'Not complete'));
  return out;
}
