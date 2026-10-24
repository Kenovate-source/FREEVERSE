import type { Db } from '../db';
import { uuid } from '../db';
import { audit } from '../services/audit';
import { createCaseForAiFlag } from '../moderation/cases';

/**
 * Nova safety layer. RULES-BASED and deliberately simple: it is a safety net that does not depend on a model being configured,
 * not a clinical tool. It will miss things and will over-trigger on some phrases; a model-based classifier is the documented next step
 * (docs/AI.md). It never diagnoses, and it never decides anything about a person.
 */
export type Severity = 'elevated' | 'crisis';
export interface SafetyResult { severity: Severity | null; category: string | null }

const RULES: { re: RegExp; category: string; severity: Severity }[] = [
  { re: /\b(kill(ing)? myself|end(ing)? my life|suicid\w*|want(ed)? to die|don'?t want to (live|be alive|be here)|better off dead|self[- ]?harm\w*|hurt(ing)? myself|cut(ting)? myself|overdos\w*|take my own life)\b/i, category: 'self_harm', severity: 'crisis' },
  { re: /\b(kill|hurt|shoot|stab) (him|her|them|my (boss|teacher|partner|ex|parents?))\b|\bgoing to (shoot|stab|attack)\b/i, category: 'harm_to_others', severity: 'crisis' },
  { re: /\b(i (am|was|got|have been) (being )?(abused|assaulted|raped|molested)|someone (is )?(hitting|abusing|raping|threatening) me|sexual(ly)? assault\w*)\b/i, category: 'abuse_or_assault', severity: 'elevated' },
  { re: /\b(hopeless|can'?t go on|no point (in )?(living|anything)|nobody would (care|miss me)|worthless|can'?t cope)\b/i, category: 'severe_distress', severity: 'elevated' },
];

export function analyse(text: string): SafetyResult {
  let best: SafetyResult = { severity: null, category: null };
  for (const r of RULES) {
    if (r.re.test(text)) {
      if (r.severity === 'crisis') return { severity: 'crisis', category: r.category };
      best = { severity: 'elevated', category: r.category };
    }
  }
  return best;
}

export const CRISIS_RESOURCES = [
  { label: 'Immediate danger', detail: 'Call your local emergency number now (112 works in many countries, including Nigeria and the EU; 911 in the US and Canada; 999 in the UK).' },
  { label: 'Find a helpline in your country', detail: 'findahelpline.com lists free, confidential helplines worldwide.', url: 'https://findahelpline.com' },
  { label: 'United States', detail: 'Call or text 988 (Suicide & Crisis Lifeline).' },
  { label: 'UK and Ireland', detail: 'Samaritans: 116 123 (free, 24/7).' },
  { label: 'Someone you trust', detail: 'Reach out to a friend, family member, teacher or doctor and tell them how bad it feels. You do not have to carry it alone.' },
];

export const CRISIS_REPLY =
  'I’m really glad you told me, and I’m taking it seriously. I’m an AI, and I can’t be the support you deserve right now, so please reach out to a real person: if you might act on these thoughts or are in danger, call your local emergency number now. ' +
  'The resources below are free and confidential. If it helps, I can stay and talk with you while you reach out to someone.';

export const FLAG_DISCLOSURE = 'If you mention serious risk of harm, a short excerpt may be kept for up to 30 days so a small safety team can check you were pointed to help. The rest of your conversations are not available to reviewers.';

export async function retentionDays(db: Db): Promise<number> {
  const r = await db.get<{ value: unknown }>("SELECT value FROM platform_config WHERE key = 'nova.flag_retention_days'");
  const v = typeof r?.value === 'string' ? Number(JSON.parse(r.value)) : Number(r?.value);
  return Number.isFinite(v) && v >= 1 && v <= 365 ? v : 30;
}

export async function flagExchange(db: Db, o: { userId: string; conversationId: string | null; messageId: string | null; agentId: string; category: string; severity: Severity; excerpt: string; now: Date }): Promise<string> {
  const id = uuid();
  const expires = new Date(o.now.getTime() + (await retentionDays(db)) * 86400_000).toISOString();
  // Conversation/message ids are plain values (no foreign keys): deleting the conversation must not erase evidence a review still needs.
  await db.run('INSERT INTO ai_safety_flags (id, user_id, conversation_id, message_id, agent_id, category, severity, excerpt, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [id, o.userId, o.conversationId, o.messageId, o.agentId, o.category, o.severity, o.excerpt.slice(0, 400), o.now.toISOString(), expires]);
  await createCaseForAiFlag(db, { flagId: id, category: o.category, severity: o.severity, now: o.now });
  await audit(db, { actorId: null, action: 'ai.safety_flag_created', targetType: 'ai_flag', targetId: id, meta: { category: o.category, severity: o.severity, agent: o.agentId } }, o.now);
  return id;
}

/** Deletes flags past their expiry and blanks the copied excerpt on their cases. Safe to call often. */
export async function purgeExpiredFlags(db: Db, now: Date): Promise<number> {
  const due = await db.query<{ id: string }>('SELECT id FROM ai_safety_flags WHERE expires_at <= $1', [now.toISOString()]);
  for (const f of due) {
    await db.run("UPDATE moderation_cases SET snapshot = $2, status = CASE WHEN status IN ('open','in_review') THEN 'resolved' ELSE status END, resolution = COALESCE(resolution, 'expired'), resolved_at = COALESCE(resolved_at, $3) WHERE target_type = 'ai_flag' AND target_id = $1",
      [f.id, { type: 'ai_flag', expired: true, note: 'The excerpt expired and was deleted automatically.' }, now.toISOString()]);
    await db.run('DELETE FROM ai_safety_flags WHERE id = $1', [f.id]);
  }
  return due.length;
}
