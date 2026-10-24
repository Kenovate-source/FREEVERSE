import type { Db } from '../db';

/**
 * Anonymous participation, server side.
 *
 * The real author is ALWAYS stored (posts.author_id / comments.author_id) for abuse prevention, moderation and account deletion,
 * and is NEVER serialized to other viewers. Inside one post every anonymous participant gets a stable pseudonym so a conversation
 * can be followed ("Anonymous member 3") without any link to an account. Alias 0 is the original poster of an anonymous post.
 */
export const aliasLabel = (n: number): string => (n === 0 ? 'Anonymous author' : `Anonymous member ${n}`);

/** Returns the viewer's alias number in this post, allocating one on first anonymous participation. */
export async function aliasFor(db: Db, postId: string, userId: string, isOriginalPoster: boolean): Promise<number> {
  const have = await db.get<{ alias_no: number }>('SELECT alias_no FROM post_anon_aliases WHERE post_id = $1 AND user_id = $2', [postId, userId]);
  if (have) return Number(have.alias_no);
  if (isOriginalPoster) {
    await db.run('INSERT INTO post_anon_aliases (post_id, user_id, alias_no) VALUES ($1,$2,0)', [postId, userId]);
    return 0;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const m = await db.get<{ n: number | null }>('SELECT MAX(alias_no) AS n FROM post_anon_aliases WHERE post_id = $1', [postId]);
    const next = Number(m?.n ?? 0) + 1;
    try {
      await db.run('INSERT INTO post_anon_aliases (post_id, user_id, alias_no) VALUES ($1,$2,$3)', [postId, userId, next]);
      return next;
    } catch (e) {
      const again = await db.get<{ alias_no: number }>('SELECT alias_no FROM post_anon_aliases WHERE post_id = $1 AND user_id = $2', [postId, userId]);
      if (again) return Number(again.alias_no);
      if (attempt === 4) throw e;
    }
  }
  throw new Error('alias allocation failed');
}

/** alias numbers for the given user ids within one post (map userId -> alias_no). Used only to label content. */
export async function aliasMap(db: Db, postId: string): Promise<Map<string, number>> {
  const rows = await db.query<{ user_id: string; alias_no: number }>('SELECT user_id, alias_no FROM post_anon_aliases WHERE post_id = $1', [postId]);
  return new Map(rows.map((r) => [r.user_id, Number(r.alias_no)]));
}

/**
 * Moderation-only: the real author of anonymous content. Callers must hold `moderation.reveal_anonymous`, record a reason and
 * an audit event BEFORE calling this (see server/modules/moderation.ts). Never expose the result to ordinary viewers.
 */
export async function getAnonymousAuthor(db: Db, targetType: 'post' | 'comment', targetId: string): Promise<string | null> {
  const row = targetType === 'post'
    ? await db.get<{ author_id: string | null; is_anonymous: unknown }>('SELECT author_id, is_anonymous FROM posts WHERE id = $1', [targetId])
    : await db.get<{ author_id: string | null; is_anonymous: unknown }>('SELECT author_id, is_anonymous FROM comments WHERE id = $1', [targetId]);
  return row?.author_id ?? null;
}
