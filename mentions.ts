import type { Db } from '../db';
import { placeholders } from '../db';
import { notify } from '../services/notify';
import { relations, audienceAllows } from '../policy/visibility';

const HANDLE_RE = /(^|[^a-z0-9_@])@([a-z0-9_]{3,30})/gi;
export const extractHandles = (text: string): string[] => [...new Set([...text.matchAll(HANDLE_RE)].map((m) => m[2]!.toLowerCase()))].slice(0, 10);

/**
 * Notifies people tagged with @handle, honouring each person's "who can mention me" setting and blocks.
 * Returns how many were notified. Anonymous authors still can tag; the notification then carries no actor.
 */
export async function notifyMentions(db: Db, o: { actorId: string; anonymous: boolean; text: string; targetType: 'post' | 'comment'; targetId: string; postId: string; now: Date; exclude?: string[] }): Promise<number> {
  const handles = extractHandles(o.text);
  if (!handles.length) return 0;
  const users = await db.query<{ id: string; who: string | null }>(
    `SELECT u.id, pr.who_can_mention AS who FROM users u LEFT JOIN user_privacy pr ON pr.user_id = u.id
      WHERE u.status = 'active' AND lower(u.handle) IN (${placeholders(1, handles.length)})`, handles);
  let n = 0;
  for (const u of users) {
    if (u.id === o.actorId || o.exclude?.includes(u.id)) continue;
    const rel = (await relations(db, u.id, [o.actorId])).get(o.actorId)!;
    const who = u.who ?? 'members';
    if (who === 'nobody' || (who === 'connections' && !rel.connection) || rel.blocked) continue;
    void audienceAllows;
    if (await notify(db, { userId: u.id, type: 'mention', actorId: o.actorId, actorAnonymous: o.anonymous, targetType: o.targetType, targetId: o.targetId, data: { postId: o.postId } }, o.now)) n++;
  }
  return n;
}
