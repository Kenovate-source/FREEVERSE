import type { Db } from '../db';
import { bool } from '../db';

/** Minimal frozen copy of reported content, stored on the moderation case so review never needs standing access to private data. */
export async function snapshotPost(db: Db, postId: string): Promise<Record<string, unknown> | null> {
  const p = await db.get<any>(
    `SELECT p.id, p.kind, p.title, p.body, p.is_anonymous, p.visibility, p.created_at, p.community_id, c.name AS community_name, p.status
       FROM posts p LEFT JOIN communities c ON c.id = p.community_id WHERE p.id = $1`, [postId]);
  if (!p) return null;
  return { type: 'post', id: p.id, kind: p.kind, title: p.title, body: String(p.body).slice(0, 2000), anonymous: bool(p.is_anonymous), visibility: p.visibility, community: p.community_name ?? null, postedAt: p.created_at, statusAtReport: p.status };
}

export async function snapshotComment(db: Db, commentId: string): Promise<Record<string, unknown> | null> {
  const c = await db.get<any>('SELECT id, post_id, body, is_anonymous, created_at, status FROM comments WHERE id = $1', [commentId]);
  if (!c) return null;
  const parent = await snapshotPost(db, c.post_id);
  return { type: 'comment', id: c.id, postId: c.post_id, body: String(c.body).slice(0, 2000), anonymous: bool(c.is_anonymous), postedAt: c.created_at, statusAtReport: c.status, inPost: parent ? { title: parent.title, body: String(parent.body).slice(0, 300) } : null };
}
