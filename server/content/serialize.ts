import type { Services } from '../services';
import { bool, json, placeholders } from '../db';
import { personCards } from '../services/people';
import { signedMediaUrl } from '../services/media-urls';
import { aliasLabel } from './anonymity';
import type { AuthorView, CommentView, PostView, PollView } from '../../shared/api/content';
import type { ReactionKind } from '../../shared/constants';

const emptyCounts = () => ({ reactions: {} as Partial<Record<ReactionKind, number>>, reactionTotal: 0 });

async function reactionData(s: Services, viewerId: string, type: 'post' | 'comment', ids: string[]) {
  const counts = new Map<string, ReturnType<typeof emptyCounts>>();
  const mine = new Map<string, ReactionKind>();
  if (!ids.length) return { counts, mine };
  const rows = await s.db.query<{ target_id: string; kind: ReactionKind; n: number }>(
    `SELECT target_id, kind, COUNT(*) AS n FROM reactions WHERE target_type = $1 AND target_id IN (${placeholders(2, ids.length)}) GROUP BY target_id, kind`, [type, ...ids]);
  for (const r of rows) {
    const c = counts.get(r.target_id) ?? counts.set(r.target_id, emptyCounts()).get(r.target_id)!;
    c.reactions[r.kind] = Number(r.n); c.reactionTotal += Number(r.n);
  }
  const my = await s.db.query<{ target_id: string; kind: ReactionKind }>(
    `SELECT target_id, kind FROM reactions WHERE target_type = $1 AND user_id = $2 AND target_id IN (${placeholders(3, ids.length)})`, [type, viewerId, ...ids]);
  for (const r of my) mine.set(r.target_id, r.kind);
  return { counts, mine };
}

/**
 * Turns post rows (SELECT p.*, c.slug AS c_slug, c.name AS c_name) into what ONE viewer may see.
 * Anonymous posts get an alias only: author_id is read here to work out "is this mine?" and is never copied into the output.
 */
export async function serializePosts(s: Services, viewerId: string, rows: any[]): Promise<PostView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const ph = placeholders(1, ids.length);

  const identified = rows.filter((r) => !bool(r.is_anonymous)).map((r) => r.author_id as string | null);
  const cards = await personCards(s, viewerId, identified);

  const media = await s.db.query<any>(
    `SELECT pm.post_id, m.id, m.alt_text, m.width, m.height FROM post_media pm JOIN media m ON m.id = pm.media_id
      WHERE pm.post_id IN (${ph}) AND m.deleted_at IS NULL ORDER BY pm.post_id, pm.sort_order`, ids);
  const mediaBy = new Map<string, any[]>();
  for (const m of media) (mediaBy.get(m.post_id) ?? mediaBy.set(m.post_id, []).get(m.post_id)!).push(m);

  const commentCounts = new Map((await s.db.query<{ post_id: string; n: number }>(
    `SELECT post_id, COUNT(*) AS n FROM comments WHERE status = 'published' AND post_id IN (${ph}) GROUP BY post_id`, ids)).map((r) => [r.post_id, Number(r.n)]));
  const { counts, mine } = await reactionData(s, viewerId, 'post', ids);
  const saved = new Set((await s.db.query<{ ref_id: string }>(
    `SELECT ref_id FROM saved_items WHERE user_id = $1 AND kind = 'post' AND ref_id IN (${placeholders(2, ids.length)})`, [viewerId, ...ids])).map((r) => r.ref_id));

  const pollIds = rows.filter((r) => r.kind === 'poll').map((r) => r.id as string);
  const pollVotes = new Map<string, number[]>();
  const myVotes = new Map<string, number>();
  if (pollIds.length) {
    for (const v of await s.db.query<{ post_id: string; option_index: number; n: number }>(
      `SELECT post_id, option_index, COUNT(*) AS n FROM poll_votes WHERE post_id IN (${placeholders(1, pollIds.length)}) GROUP BY post_id, option_index`, pollIds)) {
      const arr = pollVotes.get(v.post_id) ?? pollVotes.set(v.post_id, []).get(v.post_id)!;
      arr[Number(v.option_index)] = Number(v.n);
    }
    for (const v of await s.db.query<{ post_id: string; option_index: number }>(
      `SELECT post_id, option_index FROM poll_votes WHERE user_id = $1 AND post_id IN (${placeholders(2, pollIds.length)})`, [viewerId, ...pollIds])) myVotes.set(v.post_id, Number(v.option_index));
  }

  return rows.map((r): PostView => {
    const anon = bool(r.is_anonymous);
    const isMine = r.author_id === viewerId;
    const status = r.status as PostView['status'];
    const data = json<Record<string, unknown>>(r.data, {});
    const shown = status === 'published';
    const author: AuthorView = anon
      ? { anonymous: true, alias: aliasLabel(0) }
      : { anonymous: false, person: cards.get(r.author_id) ?? { id: null, handle: null, displayName: 'Deleted account', headline: null, avatar: { mode: 'avatar', config: { seed: 'neutral' }, photoUrl: null }, isSelf: false, deleted: true, restricted: false, isDemo: false } };
    let poll: PollView | null = null;
    if (r.kind === 'poll' && shown) {
      const labels = (data.options as string[] | undefined) ?? [];
      const votes = pollVotes.get(r.id) ?? [];
      const voted = myVotes.get(r.id) ?? null;
      const closesAt = (data.closesAt as string | undefined) ?? null;
      const closed = !!closesAt && new Date(closesAt) <= s.now();
      const visible = voted !== null || isMine || closed;
      poll = { options: labels.map((label, i) => ({ label, votes: visible ? votes[i] ?? 0 : null })), total: votes.reduce((a, b) => a + (b ?? 0), 0), votedIndex: voted, resultsVisible: visible, closesAt };
    }
    const notice = status === 'removed' ? `Removed by moderators${r.removed_reason ? `: ${r.removed_reason}` : ''}.` : status === 'deleted' ? 'Deleted by the author.' : null;
    const { options: _o, closesAt: _c, ...publicData } = data as any;
    return {
      id: r.id, kind: r.kind, title: shown ? r.title ?? null : null, body: shown ? r.body : '', tags: shown ? json<string[]>(r.tags, []) : [], visibility: r.visibility,
      community: r.community_id ? { id: r.community_id, slug: r.c_slug, name: r.c_name } : null,
      author, status, notice, createdAt: r.created_at, editedAt: r.edited_at ?? null,
      data: shown ? publicData : {},
      media: shown ? (mediaBy.get(r.id) ?? []).map((m) => ({ id: m.id, url: signedMediaUrl(s, viewerId, m.id), altText: m.alt_text ?? null, width: m.width ?? null, height: m.height ?? null })) : [],
      poll,
      counts: { comments: commentCounts.get(r.id) ?? 0, ...(counts.get(r.id) ?? emptyCounts()) },
      viewer: {
        mine: isMine, reaction: mine.get(r.id) ?? null, saved: saved.has(r.id),
        canEdit: isMine && shown, canDelete: isMine && status !== 'deleted', canComment: shown,
      },
    };
  });
}

/** Comments for one post. `aliases` maps real user id -> alias number, for anonymous comments only. */
export async function serializeComments(s: Services, viewerId: string, rows: any[], aliases: Map<string, number>): Promise<CommentView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const cards = await personCards(s, viewerId, rows.filter((r) => !bool(r.is_anonymous)).map((r) => r.author_id));
  const { counts, mine } = await reactionData(s, viewerId, 'comment', ids);
  return rows.map((r): CommentView => {
    const anon = bool(r.is_anonymous);
    const status = r.status as CommentView['status'];
    const isMine = r.author_id === viewerId;
    const shown = status === 'published';
    const author: AuthorView = anon
      ? { anonymous: true, alias: aliasLabel(r.author_id ? aliases.get(r.author_id) ?? 1 : 1) }
      : { anonymous: false, person: cards.get(r.author_id) ?? { id: null, handle: null, displayName: 'Deleted account', headline: null, avatar: { mode: 'avatar', config: { seed: 'neutral' }, photoUrl: null }, isSelf: false, deleted: true, restricted: false, isDemo: false } };
    return {
      id: r.id, postId: r.post_id, parentId: r.parent_id ?? null, depth: Number(r.depth), author,
      body: shown ? r.body : '', status,
      notice: status === 'removed' ? 'Removed by moderators.' : status === 'deleted' ? (r.author_id ? 'Deleted by the author.' : 'This comment was removed because the account was deleted.') : null,
      createdAt: r.created_at, editedAt: r.edited_at ?? null,
      counts: counts.get(r.id) ?? emptyCounts(),
      viewer: { mine: isMine, reaction: mine.get(r.id) ?? null, canEdit: isMine && shown, canDelete: isMine && status === 'published' },
    };
  });
}
