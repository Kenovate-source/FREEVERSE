import type { Db } from '../db';
import { uuid } from '../db';
import { snapshotComment, snapshotPost } from '../content/snapshot';
import type { ReportCategory } from '../../shared/constants';

export type Priority = 'crisis' | 'high' | 'normal' | 'low';
const PRIORITY: Record<string, Priority> = { self_harm_crisis: 'crisis', illegal: 'high', harassment: 'high', unwanted_contact: 'high', impersonation: 'normal', spam: 'low', other: 'normal' };
/** Target response windows in hours. These are internal goals, NOT a promise to users: FREEVERSE has no 24/7 moderation. */
export const TARGET_HOURS: Record<Priority, number> = { crisis: 4, high: 24, normal: 72, low: 168 };

export interface FileReportInput { reporterId: string; targetType: 'post' | 'comment' | 'user' | 'message'; targetId: string; category: ReportCategory; details?: string | null; now: Date }

async function targetUser(db: Db, type: string, id: string): Promise<string | null> {
  if (type === 'post') return (await db.get<{ author_id: string | null }>('SELECT author_id FROM posts WHERE id = $1', [id]))?.author_id ?? null;
  if (type === 'comment') return (await db.get<{ author_id: string | null }>('SELECT author_id FROM comments WHERE id = $1', [id]))?.author_id ?? null;
  if (type === 'user') return id;
  if (type === 'message') return (await db.get<{ sender_id: string | null }>('SELECT sender_id FROM messages WHERE id = $1', [id]))?.sender_id ?? null;
  return null;
}

async function snapshotFor(db: Db, type: string, id: string): Promise<Record<string, unknown>> {
  if (type === 'post') return (await snapshotPost(db, id)) ?? { type: 'post', missing: true };
  if (type === 'comment') return (await snapshotComment(db, id)) ?? { type: 'comment', missing: true };
  if (type === 'message') {
    const m = await db.get<any>('SELECT id, body, created_at FROM messages WHERE id = $1', [id]);
    return m ? { type: 'message', id: m.id, body: String(m.body).slice(0, 2000), sentAt: m.created_at, note: 'Only the reported message is included, not the rest of the conversation.' } : { type: 'message', missing: true };
  }
  const u = await db.get<any>('SELECT handle, display_name FROM users WHERE id = $1', [id]);
  return { type: 'user', handle: u?.handle ?? null, displayName: u?.display_name ?? null };
}

/** Records a report and attaches it to a case, reusing an open case for the same target and category. */
export async function fileReport(db: Db, i: FileReportInput): Promise<{ reportId: string; caseId: string }> {
  const now = i.now.toISOString();
  let c = await db.get<{ id: string; priority: Priority }>("SELECT id, priority FROM moderation_cases WHERE target_type = $1 AND target_id = $2 AND category = $3 AND status IN ('open','in_review')", [i.targetType, i.targetId, i.category]);
  if (!c) {
    const priority = PRIORITY[i.category] ?? 'normal';
    const id = uuid();
    await db.run(
      `INSERT INTO moderation_cases (id, status, priority, category, target_type, target_id, target_user_id, snapshot, due_at, created_at) VALUES ($1,'open',$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, priority, i.category, i.targetType, i.targetId, await targetUser(db, i.targetType, i.targetId), await snapshotFor(db, i.targetType, i.targetId), new Date(i.now.getTime() + TARGET_HOURS[priority] * 3600_000).toISOString(), now]);
    c = { id, priority };
  }
  const reportId = uuid();
  await db.run('INSERT INTO reports (id, reporter_id, target_type, target_id, category, details, case_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)',
    [reportId, i.reporterId, i.targetType, i.targetId, i.category, i.details ?? null, c.id, now]);
  return { reportId, caseId: c.id };
}

/** Called by the Nova safety layer: a flagged exchange becomes a case containing only the minimal excerpt. */
export async function createCaseForAiFlag(db: Db, o: { flagId: string; category: string; severity: 'elevated' | 'crisis'; now: Date }): Promise<string> {
  const flag = await db.get<any>('SELECT id, user_id, excerpt, expires_at FROM ai_safety_flags WHERE id = $1', [o.flagId]);
  const existing = await db.get<{ id: string }>("SELECT id FROM moderation_cases WHERE target_type = 'ai_flag' AND target_id = $1 AND category = $2 AND status IN ('open','in_review')", [o.flagId, o.category]);
  if (existing) return existing.id;
  const priority: Priority = o.severity === 'crisis' ? 'crisis' : 'high';
  const id = uuid();
  await db.run(
    `INSERT INTO moderation_cases (id, status, priority, category, target_type, target_id, target_user_id, snapshot, due_at, created_at) VALUES ($1,'open',$2,$3,'ai_flag',$4,$5,$6,$7,$8)`,
    [id, priority, o.category, o.flagId, flag?.user_id ?? null, { type: 'ai_flag', excerpt: flag?.excerpt ?? '', expiresAt: flag?.expires_at ?? null, note: 'Minimal excerpt only. Expires automatically; the rest of the Nova conversation is not available to reviewers.' }, new Date(o.now.getTime() + TARGET_HOURS[priority] * 3600_000).toISOString(), o.now.toISOString()]);
  await db.run('UPDATE ai_safety_flags SET case_id = $2 WHERE id = $1', [o.flagId, id]);
  return id;
}
