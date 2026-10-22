import type { Services } from '../services';
import { num, uuid } from '../db';
import { collectOverview } from '../modules/founder';
import { aiApi } from '../ai/runtime';
import type { ProposalInput } from './proposals';

export type Epistemic = 'verified_fact' | 'observation' | 'assumption' | 'forecast' | 'suggestion';
export interface FindingDraft {
  dedupeKey: string; kind: 'alert' | 'observation' | 'risk' | 'opportunity'; epistemic: Epistemic; severity: 'info' | 'low' | 'medium' | 'high';
  title: string; body: string; evidence: { label: string; value: string }[];
  /** An action the AI may submit about this finding. The workflow, not this field, decides whether it runs. */
  propose?: Omit<ProposalInput, 'source' | 'requestedBy'>;
}

const val = (arr: { key: string; value: number | string }[], k: string) => num(arr.find((x) => x.key === k)?.value);

/** Deterministic checks over the platform's own data. These are the only "analysis" that happens without an AI model, and they say so. */
export async function runAnalyzers(s: Services): Promise<FindingDraft[]> {
  const o = await collectOverview(s);
  const out: FindingDraft[] = [];
  const nowMs = s.now().getTime();

  const overdue = val(o.moderation, 'cases_overdue');
  if (overdue > 0) out.push({
    dedupeKey: 'mod.overdue', kind: 'alert', epistemic: 'verified_fact', severity: val(o.moderation, 'cases_crisis') > 0 ? 'high' : 'medium',
    title: `${overdue} moderation case${overdue > 1 ? 's are' : ' is'} past the internal target time`,
    body: 'Open cases have passed the internal response goal for their priority. This is a count from the case table; I have not looked at any reported content.',
    evidence: [{ label: 'Overdue open cases', value: String(overdue) }, { label: 'Open crisis cases', value: String(val(o.moderation, 'cases_crisis')) }],
    propose: { actionType: 'founder.notify', title: 'Notify the Founder about overdue moderation cases', payload: { text: `${overdue} moderation case(s) are past their internal target time. Open Moderation to review.` }, rationale: 'Routine low-risk notification.' },
  });

  if (val(o.moderation, 'moderators') === 0) out.push({
    dedupeKey: 'mod.none', kind: 'risk', epistemic: 'verified_fact', severity: 'medium', title: 'No moderators have been appointed',
    body: 'Reports are being collected, but nobody holds the moderator role. Only the Founder can act on cases. Appointing a moderator is a high-impact change that needs your explicit approval.',
    evidence: [{ label: 'Moderators', value: '0' }, { label: 'Open cases', value: String(['crisis', 'high', 'normal', 'low'].reduce((n, p) => n + val(o.moderation, `cases_${p}`), 0)) }],
  });

  if (s.ai.provider === 'demo') out.push({
    dedupeKey: 'ai.demo', kind: 'observation', epistemic: 'verified_fact', severity: 'info', title: 'No AI model is connected',
    body: 'All specialists, including me, run without a model. My findings come from fixed checks on your data; I cannot write free-form analysis until a provider is configured.',
    evidence: [{ label: 'AI provider', value: 'demo' }],
  });
  else {
    const cap = (await aiApi.capabilityMatrix(s)).find((c) => c.id === 'text.chat');
    if (cap?.state === 'configured') out.push({
      dedupeKey: 'ai.unverified', kind: 'observation', epistemic: 'verified_fact', severity: 'low', title: 'The AI provider is configured but not verified',
      body: 'A key is present but no successful live round-trip has been recorded in the last 24 hours.', evidence: [{ label: 'text.chat state', value: 'configured' }],
      propose: { actionType: 'ai.health_check', title: 'Run an AI provider health check', payload: { agentId: 'nova' }, rationale: 'Routine low-risk read-only check.' },
    });
  }

  const filled = (lvl: number) => o.governance.find((g) => g.level === lvl)?.filled ?? 0;
  if (filled(3) < 3) out.push({
    dedupeKey: 'gov.council', kind: 'observation', epistemic: 'verified_fact', severity: 'info', title: `Council seats filled: ${filled(3)} of 3`,
    body: 'The Council of three is appointed personally by the Founder. Seats stay vacant until you choose. Vacant seats are normal early on.', evidence: [{ label: 'Council', value: `${filled(3)}/3` }],
  });

  const lastReview = o.accessReview.lastCompletedAt;
  const grants = val(o.security, 'grants_live');
  if (grants > 1 && (!lastReview || nowMs - new Date(lastReview).getTime() > 90 * 86400_000)) out.push({
    dedupeKey: 'sec.review', kind: 'risk', epistemic: 'suggestion', severity: 'low', title: 'An access review is due',
    body: lastReview ? 'The last completed review is more than 90 days old.' : 'No access review has ever been completed.', evidence: [{ label: 'Live role grants', value: String(grants) }, { label: 'Last review', value: lastReview ?? 'never' }],
  });

  const stale = o.pendingDecisions.filter((p) => nowMs - new Date(p.createdAt).getTime() > 7 * 86400_000);
  if (stale.length) out.push({
    dedupeKey: 'prop.stale', kind: 'alert', epistemic: 'verified_fact', severity: 'low', title: `${stale.length} proposal${stale.length > 1 ? 's have' : ' has'} waited over a week`,
    body: 'These are waiting for a decision. Approve, reject or ask for a revision.', evidence: stale.slice(0, 5).map((p) => ({ label: p.title, value: p.createdAt.slice(0, 10) })),
  });

  const demoUsers = Number((await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE is_demo = $1', [true]))?.n ?? 0);
  if (demoUsers && s.config.env === 'production') out.push({
    dedupeKey: 'data.demo_prod', kind: 'risk', epistemic: 'verified_fact', severity: 'high', title: 'Demo data is present in a production environment',
    body: 'Fictional demo members exist alongside real members. Members could be misled.', evidence: [{ label: 'Demo members', value: String(demoUsers) }],
  });

  // Growth: compare this week to last week, then state plainly what is observation and what is a forecast.
  const d7 = new Date(nowMs - 7 * 86400_000).toISOString(); const d14 = new Date(nowMs - 14 * 86400_000).toISOString();
  const thisWeek = num((await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE created_at > $1 AND is_demo = $2', [d7, false]))?.n);
  const lastWeek = num((await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE created_at > $1 AND created_at <= $2 AND is_demo = $3', [d14, d7, false]))?.n);
  if (thisWeek + lastWeek > 0) {
    out.push({ dedupeKey: 'growth.obs', kind: 'observation', epistemic: 'observation', severity: 'info', title: `Sign-ups: ${thisWeek} this week, ${lastWeek} last week`,
      body: 'Real (non-demo) accounts created in each 7-day window. Small numbers swing a lot, so treat the direction as weak evidence.', evidence: [{ label: 'This week', value: String(thisWeek) }, { label: 'Last week', value: String(lastWeek) }] });
    out.push({ dedupeKey: 'growth.forecast', kind: 'opportunity', epistemic: 'forecast', severity: 'info', title: `If nothing changes: about ${thisWeek} sign-ups next week`,
      body: 'This is a naive forecast: it assumes next week equals this week. It ignores seasonality, campaigns and chance. Do not plan on it.', evidence: [{ label: 'Method', value: 'next week = this week' }] });
  }

  const off = o.council.specialists.filter((a) => !a.enabled);
  if (off.length) out.push({ dedupeKey: 'ai.disabled', kind: 'observation', epistemic: 'verified_fact', severity: 'info', title: `${off.length} specialist${off.length > 1 ? 's are' : ' is'} switched off`, body: off.map((a) => a.name).join(', '), evidence: off.map((a) => ({ label: a.name, value: 'disabled' })) });

  return out;
}

export async function storeFindings(s: Services, drafts: FindingDraft[]): Promise<{ id: string; draft: FindingDraft; isNew: boolean }[]> {
  const out: { id: string; draft: FindingDraft; isNew: boolean }[] = [];
  const now = s.now().toISOString();
  for (const d of drafts) {
    const open = await s.db.get<{ id: string }>("SELECT id FROM founder_ai_findings WHERE dedupe_key = $1 AND status = 'open'", [d.dedupeKey]);
    if (open) {
      await s.db.run('UPDATE founder_ai_findings SET title = $2, body = $3, evidence = $4, severity = $5, updated_at = $6 WHERE id = $1', [open.id, d.title, d.body, d.evidence, d.severity, now]);
      out.push({ id: open.id, draft: d, isNew: false });
      continue;
    }
    // Do not resurrect something the Founder already acknowledged or dismissed in the last 7 days.
    const recent = await s.db.get("SELECT 1 AS x FROM founder_ai_findings WHERE dedupe_key = $1 AND status IN ('acknowledged','dismissed','converted') AND updated_at > $2", [d.dedupeKey, new Date(s.now().getTime() - 7 * 86400_000).toISOString()]);
    if (recent) continue;
    const id = uuid();
    await s.db.run('INSERT INTO founder_ai_findings (id, kind, epistemic, severity, title, body, evidence, dedupe_key, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)', [id, d.kind, d.epistemic, d.severity, d.title, d.body, d.evidence, d.dedupeKey, now]);
    out.push({ id, draft: d, isNew: true });
  }
  // Findings whose condition no longer holds are closed so the list never shows stale alerts.
  const keys = new Set(drafts.map((d) => d.dedupeKey));
  for (const f of await s.db.query<{ id: string; dedupe_key: string }>("SELECT id, dedupe_key FROM founder_ai_findings WHERE status = 'open' AND dedupe_key IS NOT NULL"))
    if (!keys.has(f.dedupe_key)) await s.db.run("UPDATE founder_ai_findings SET status = 'dismissed', updated_at = $2 WHERE id = $1", [f.id, now]);
  return out;
}
