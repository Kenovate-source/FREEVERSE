import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { uuid } from '../db';

export const STEP_UP_TTL_MS = 10 * 60 * 1000;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Issues a short-lived grant after the person re-proved who they are. Sensitive actions require one. */
export async function createStepUp(db: Db, userId: string, now: Date): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + STEP_UP_TTL_MS).toISOString();
  await db.run('INSERT INTO step_up_grants (id, user_id, token_hash, created_at, expires_at) VALUES ($1,$2,$3,$4,$5)', [uuid(), userId, hash(token), now.toISOString(), expiresAt]);
  await db.run('DELETE FROM step_up_grants WHERE expires_at < $1', [now.toISOString()]);
  return { token, expiresAt };
}

export async function verifyStepUp(db: Db, userId: string, token: string | undefined, now: Date): Promise<boolean> {
  if (!token) return false;
  const row = await db.get('SELECT 1 AS ok FROM step_up_grants WHERE user_id = $1 AND token_hash = $2 AND expires_at > $3', [userId, hash(token), now.toISOString()]);
  return !!row;
}
