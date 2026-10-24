import type { Db } from '../db';
import { json, uuid } from '../db';

export interface NotifyInput {
  userId: string; // recipient
  type: string; // comment | reply | reaction | follow | mention | message | message_request | system | ...
  actorId?: string | null;
  /** When the actor acted anonymously, pass actorAnonymous=true and the actorId is NOT stored. */
  actorAnonymous?: boolean;
  targetType?: string;
  targetId?: string;
  data?: Record<string, unknown>;
}

/** Creates an in-app notification unless the recipient is the actor, has blocked/been blocked, or turned that type off. */
export async function notify(db: Db, n: NotifyInput, now: Date = new Date()): Promise<boolean> {
  if (n.actorId && n.actorId === n.userId) return false;
  if (n.actorId) {
    const blocked = await db.get('SELECT 1 AS x FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [n.userId, n.actorId]);
    if (blocked) return false;
  }
  const settings = await db.get<{ notifications: unknown }>('SELECT notifications FROM user_settings WHERE user_id = $1', [n.userId]);
  const prefs = json<Record<string, boolean>>(settings?.notifications, {});
  if (prefs[n.type] === false) return false;
  await db.run(
    `INSERT INTO notifications (id, user_id, type, actor_id, actor_anonymous, target_type, target_id, data, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uuid(), n.userId, n.type, n.actorAnonymous ? null : n.actorId ?? null, !!n.actorAnonymous, n.targetType ?? null, n.targetId ?? null, n.data ?? {}, now.toISOString()],
  );
  return true;
}
