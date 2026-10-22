import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../http/errors';
import { created } from '../http/router';
import { bool, contains, json, placeholders, uuid } from '../db';
import { sqlPostVisible, sqlNotBlocked, relation, audienceAllows } from '../policy/visibility';
import { serializeComments, serializePosts } from '../content/serialize';
import { aliasFor, aliasMap } from '../content/anonymity';
import { notifyMentions } from '../content/mentions';
import { notify } from '../services/notify';
import { audit } from '../services/audit';
import { registerEraser, registerExporter } from '../services/erasure';
import { loadPrivacy } from '../profile/common';
import { POST_KINDS, REACTION_KINDS, AUDIENCES, type ReactionKind } from '../../shared/constants';
import { POST_LIMITS, type CommentsResponse, type FeedResponse, type PostView } from '../../shared/api/content';
import type { Services } from '../services';
import type { Db } from '../db';

const id = z.string().uuid();
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]/g, '').replace(/\r\n/g, '\n').trim();

export function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || raw.length > 500) return null;
    return u.toString();
  } catch { return null; }
}
const urlField = z.string().trim().max(500).transform((v, ctx) => { const u = safeUrl(v); if (!u) { ctx.addIssue({ code: 'custom', message: 'Enter a full web address starting with https://' }); return z.NEVER; } return u; });

const tagList = z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9 -]*$/, 'Tags use letters, numbers, spaces and dashes.').max(POST_LIMITS.tagMax)).max(POST_LIMITS.tagsMax).default([]);

const createBody = z.object({
  kind: z.enum(POST_KINDS).default('text'),
  title: z.string().trim().max(POST_LIMITS.titleMax).optional(),
  body: z.string().max(POST_LIMITS.bodyMax).default(''),
  communityId: id.optional(),
  visibility: z.enum(AUDIENCES).optional(),
  anonymous: z.boolean().default(false),
  tags: tagList,
  mediaIds: z.array(id).max(POST_LIMITS.mediaMax).default([]),
  url: urlField.optional(),
  pollOptions: z.array(z.string().trim().min(1).max(POST_LIMITS.pollOptionMax)).min(POST_LIMITS.pollOptionsMin).max(POST_LIMITS.pollOptionsMax).optional(),
  pollDays: z.number().int().min(1).max(30).optional(),
  startsAt: z.string().datetime().optional(),
  location: z.string().trim().max(120).optional(),
}).strict();

type CreateBody = z.infer<typeof createBody>;

function validateKind(b: CreateBody): { data: Record<string, unknown>; body: string; title: string | null } {
  const body = clean(b.body); const title = b.title ? clean(b.title) : null;
  const need = (ok: unknown, msg: string) => { if (!ok) throw unprocessable(msg, undefined, 'validation_failed'); };
  const data: Record<string, unknown> = {};
  switch (b.kind) {
    case 'text': need(body.length >= 1, 'Write something to share.'); break;
    case 'image': need(b.mediaIds.length >= 1, 'Add at least one image.'); break;
    case 'creative': need(title, 'Give your creative work a title.'); need(body || b.mediaIds.length, 'Add a description or an image.'); break;
    case 'link': need(b.url, 'Add the link you are sharing.'); data.url = b.url; break;
    case 'video_link': {
      need(b.url, 'Add the video link.'); data.url = b.url;
      const host = new URL(b.url!).hostname.replace(/^www\./, '');
      data.provider = /(^|\.)youtube\.com$|^youtu\.be$/.test(host) ? 'youtube' : /(^|\.)vimeo\.com$/.test(host) ? 'vimeo' : 'other';
      data.host = host; break;
    }
    case 'question': need(title && title.length >= 8, 'Ask your question in the title (at least 8 characters).'); break;
    case 'poll': {
      need(title, 'Ask your poll question in the title.');
      const opts = (b.pollOptions ?? []).map(clean).filter(Boolean);
      need(opts.length >= POST_LIMITS.pollOptionsMin, 'A poll needs at least two options.');
      need(new Set(opts.map((o) => o.toLowerCase())).size === opts.length, 'Poll options must be different.');
      data.options = opts;
      if (b.pollDays) data.closesAt = new Date(Date.now() + b.pollDays * 86400_000).toISOString();
      break;
    }
    case 'article': need(title, 'Give your article a title.'); need(body.length >= 200, 'Articles need at least 200 characters. Use a plain post for something shorter.'); data.readMinutes = Math.max(1, Math.round(body.split(/\s+/).length / 220)); break;
    case 'resource': need(title, 'Give the resource a title.'); need(b.url || body, 'Add a link or describe the resource.'); if (b.url) data.url = b.url; break;
    case 'event': need(title, 'Give the event a title.'); need(b.startsAt, 'Add when it starts.'); data.startsAt = b.startsAt; if (b.location) data.location = clean(b.location); if (b.url) data.url = b.url; break;
  }
  return { data, body, title };
}

/** Loads a post the viewer may see (blocks, audience, account status honoured). Returns null — never "forbidden" — when not visible. */
export async function loadVisiblePost(db: Db, viewerId: string, postId: string): Promise<any | null> {
  return (await db.get<any>(
    `SELECT p.*, c.slug AS c_slug, c.name AS c_name, c.allow_anonymous AS c_anon FROM posts p LEFT JOIN users pu ON pu.id = p.author_id LEFT JOIN communities c ON c.id = p.community_id
      WHERE p.id = $2 AND ${sqlPostVisible('$1')}`, [viewerId, postId])) ?? null;
}

const SELECT_POST = 'SELECT p.*, c.slug AS c_slug, c.name AS c_name FROM posts p LEFT JOIN users pu ON pu.id = p.author_id LEFT JOIN communities c ON c.id = p.community_id';

const feedQuery = z.object({
  sort: z.enum(['recent', 'relevant', 'following']).default('recent'),
  community: z.string().max(48).optional(),
  kind: z.enum(POST_KINDS).optional(),
  tag: z.string().max(24).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

const SORT_TEXT = {
  recent: 'Newest first. Nothing is hidden by an algorithm.',
  following: 'Posts from people you follow and communities you joined, newest first.',
  relevant: 'Ranked with a simple, visible formula: interests you share, people you follow, communities you joined, replies and reactions, and recency. Each post says why it is shown.',
} as const;

async function feed(s: Services, me: string, q: z.infer<typeof feedQuery>): Promise<FeedResponse> {
  const params: unknown[] = [me];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = [sqlPostVisible('$1'), "(p.community_id IS NULL OR c.status = 'active')"];
  // Muted people are hidden. Anonymous posts are never matched by author: that would leak authorship.
  where.push(`NOT (p.is_anonymous = ${p(false)} AND EXISTS (SELECT 1 FROM mutes mu WHERE mu.user_id = $1 AND mu.muted_id = p.author_id))`);
  if (q.community) where.push(`c.slug = ${p(q.community)}`);
  if (q.kind) where.push(`p.kind = ${p(q.kind)}`);
  if (q.tag) where.push(`p.tags LIKE ${p(`%"${q.tag.toLowerCase().replace(/[%_"\\]/g, '')}"%`)}`);
  if (q.q) { const l = p(contains(q.q)); where.push(`(lower(COALESCE(p.title,'')) LIKE ${l} ESCAPE '\\' OR lower(p.body) LIKE ${l} ESCAPE '\\')`); }
  if (q.sort === 'following') {
    where.push(`((p.is_anonymous = ${p(false)} AND p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)) OR p.community_id IN (SELECT community_id FROM community_members WHERE user_id = $1) OR p.author_id = $1)`);
  }
  const base = `${SELECT_POST} WHERE ${where.join(' AND ')}`;

  if (q.sort !== 'relevant') {
    let cur = '';
    if (q.cursor) { const [ca, ci] = q.cursor.split('|'); if (!ca || !ci) throw badRequest('Bad cursor.'); cur = ` AND (p.created_at < ${p(ca)} OR (p.created_at = ${p(ca)} AND p.id < ${p(ci)}))`; }
    const rows = await s.db.query<any>(`${base}${cur} ORDER BY p.created_at DESC, p.id DESC LIMIT ${q.limit + 1}`, params);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return { items: await serializePosts(s, me, page), nextCursor: rows.length > q.limit && last ? `${last.created_at}|${last.id}` : null, sort: q.sort, explanation: SORT_TEXT[q.sort] };
  }

  // Relevant: rank a bounded window of recent visible posts with a transparent formula.
  const since = new Date(s.now().getTime() - 30 * 86400_000).toISOString();
  const rows = await s.db.query<any>(`${base} AND p.created_at > ${p(since)} ORDER BY p.created_at DESC, p.id DESC LIMIT 300`, params);
  const mineTags = new Set((await s.db.query<{ key: string; label: string }>("SELECT key, label FROM user_tags WHERE user_id = $1 AND kind = 'interest'", [me])).flatMap((t) => [t.key, t.label.toLowerCase()]));
  const following = new Set((await s.db.query<{ followee_id: string }>('SELECT followee_id FROM follows WHERE follower_id = $1', [me])).map((r) => r.followee_id));
  const joined = new Set((await s.db.query<{ community_id: string }>('SELECT community_id FROM community_members WHERE user_id = $1', [me])).map((r) => r.community_id));
  const ids = rows.map((r) => r.id as string);
  const engagement = new Map<string, number>();
  if (ids.length) {
    for (const r of await s.db.query<{ target_id: string; n: number }>(`SELECT target_id, COUNT(*) AS n FROM reactions WHERE target_type = 'post' AND target_id IN (${placeholders(1, ids.length)}) GROUP BY target_id`, ids)) engagement.set(r.target_id, Number(r.n));
    for (const r of await s.db.query<{ post_id: string; n: number }>(`SELECT post_id, COUNT(*) AS n FROM comments WHERE status = 'published' AND post_id IN (${placeholders(1, ids.length)}) GROUP BY post_id`, ids)) engagement.set(r.post_id, (engagement.get(r.post_id) ?? 0) + 2 * Number(r.n));
  }
  const ranked = rows.map((r) => {
    const why: string[] = []; let score = 0;
    const tags = json<string[]>(r.tags, []);
    const shared = tags.filter((t) => mineTags.has(t.toLowerCase()));
    if (shared.length) { score += 3 * shared.length; why.push(`Matches your interest${shared.length > 1 ? 's' : ''}: ${shared.slice(0, 2).join(', ')}`); }
    if (!bool(r.is_anonymous) && following.has(r.author_id)) { score += 2; why.push('From someone you follow'); }
    if (r.community_id && joined.has(r.community_id)) { score += 1.5; why.push(`From ${r.c_name}, which you joined`); }
    const eng = engagement.get(r.id) ?? 0;
    if (eng > 0) { score += Math.min(3, Math.log2(1 + eng)); if (eng >= 4) why.push('Lively conversation'); }
    const ageH = Math.max(0, (s.now().getTime() - new Date(r.created_at).getTime()) / 3600_000);
    score += 4 * Math.pow(0.5, ageH / 36);
    if (!why.length) why.push('Recent in the community');
    return { r, score, why };
  }).sort((a, b) => b.score - a.score || (a.r.created_at < b.r.created_at ? 1 : -1));
  const offset = q.cursor?.startsWith('o:') ? Math.max(0, parseInt(q.cursor.slice(2), 10) || 0) : 0;
  const slice = ranked.slice(offset, offset + q.limit);
  const items = await serializePosts(s, me, slice.map((x) => x.r));
  items.forEach((it, i) => { it.why = slice[i]!.why.slice(0, 3); });
  return { items, nextCursor: offset + q.limit < ranked.length ? `o:${offset + q.limit}` : null, sort: 'relevant', explanation: SORT_TEXT.relevant };
}

async function isMember(db: Db, communityId: string, userId: string) {
  return !!(await db.get('SELECT 1 AS x FROM community_members WHERE community_id = $1 AND user_id = $2', [communityId, userId]));
}

export const postsModule: ModuleDef = {
  name: 'posts',
  register(router, s) {
    router.get('/api/feed', { auth: 'active', query: feedQuery, rate: { key: 'feed', limit: 240, windowMs: 60_000 } }, async (c) => feed(s, c.me.userId, c.query));

    router.post('/api/posts', { auth: 'active', body: createBody, rate: { key: 'post:create', limit: 20, windowMs: 10 * 60_000 } }, async (c) => {
      const b = c.body; const me = c.me.userId;
      const v = validateKind(b);
      let community: any = null;
      if (b.communityId) {
        community = await c.db.get<any>("SELECT id, allow_anonymous FROM communities WHERE id = $1 AND status = 'active'", [b.communityId]);
        if (!community) throw notFound('We couldn’t find that community.');
        if (!(await isMember(c.db, community.id, me))) throw forbidden('Join this community to post in it.', 'not_a_member');
      }
      if (b.anonymous) {
        if (!s.config.anonymousPostingEnabled) throw conflict('Anonymous posting is switched off.', 'anonymous_disabled');
        if (!community || !bool(community.allow_anonymous)) throw conflict('This community does not allow anonymous posts.', 'anonymous_not_allowed');
        s.rate.check(`post:anon:${me}`, 5, 3600_000); // abuse prevention
      }
      if (b.mediaIds.length) {
        const owned = await c.db.query<{ id: string }>(`SELECT id FROM media WHERE owner_id = $1 AND deleted_at IS NULL AND id IN (${placeholders(2, b.mediaIds.length)})`, [me, ...b.mediaIds]);
        if (owned.length !== new Set(b.mediaIds).size) throw unprocessable('One of the images is not available.', undefined, 'media_invalid');
      }
      // Community and anonymous posts are visible to members; otherwise the author's default applies.
      let visibility = b.visibility ?? (await loadPrivacy(c.db, me)).default_post_visibility;
      if (community) visibility = visibility === 'only_me' ? 'only_me' : 'members';
      if (b.anonymous) visibility = 'members';
      const pid = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        await t.run(
          `INSERT INTO posts (id, author_id, kind, title, body, community_id, visibility, is_anonymous, data, tags, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [pid, me, b.kind, v.title, v.body, community?.id ?? null, visibility, b.anonymous, v.data, [...new Set(b.tags)], now]);
        let i = 0;
        for (const m of [...new Set(b.mediaIds)]) await t.run('INSERT INTO post_media (post_id, media_id, sort_order) VALUES ($1,$2,$3)', [pid, m, i++]);
        if (b.anonymous) await aliasFor(t, pid, me, true);
        await notifyMentions(t, { actorId: me, anonymous: b.anonymous, text: `${v.title ?? ''}\n${v.body}`, targetType: 'post', targetId: pid, postId: pid, now: c.now() });
      });
      const row = await c.db.get<any>(`${SELECT_POST} WHERE p.id = $1`, [pid]);
      const [post] = await serializePosts(s, me, [row]);
      return created({ post, anonymityNote: b.anonymous ? 'Posted anonymously. Other members see an alias, never your name. Moderators can review reports about this post; revealing an author needs a recorded reason.' : null });
    });

    router.get('/api/posts/:id', { auth: 'active' }, async (c) => {
      const pid = id.safeParse(c.params.id);
      if (!pid.success) throw notFound('We couldn’t find that post.');
      let row = await loadVisiblePost(c.db, c.me.userId, pid.data);
      if (!row) {
        // The author may still open their own removed/deleted post to see what happened.
        const own = await c.db.get<any>(`${SELECT_POST} WHERE p.id = $1 AND p.author_id = $2`, [pid.data, c.me.userId]);
        if (!own) throw notFound('We couldn’t find that post. It may have been removed or may not be shared with you.');
        row = own;
      }
      const [post] = await serializePosts(s, c.me.userId, [row]);
      return { post };
    });

    const patchBody = z.object({ title: z.string().trim().max(POST_LIMITS.titleMax).nullable().optional(), body: z.string().max(POST_LIMITS.bodyMax).optional(), tags: tagList.optional(), visibility: z.enum(AUDIENCES).optional() }).strict();
    router.patch('/api/posts/:id', { auth: 'active', body: patchBody, rate: { key: 'post:edit', limit: 60, windowMs: 10 * 60_000 } }, async (c) => {
      const pid = id.parse(c.params.id);
      const row = await c.db.get<any>('SELECT * FROM posts WHERE id = $1', [pid]);
      if (!row || row.author_id !== c.me.userId) throw notFound('We couldn’t find that post.');
      if (row.status !== 'published') throw conflict('This post can no longer be edited.', 'not_editable');
      const b = c.body;
      if (!Object.keys(b).length) throw badRequest('Nothing to change.');
      const body = b.body !== undefined ? clean(b.body) : row.body;
      const title = b.title !== undefined ? (b.title ? clean(b.title) : null) : row.title;
      const needTitle = ['question', 'poll', 'article', 'creative', 'resource', 'event'].includes(row.kind);
      if (needTitle && !title) throw unprocessable('This kind of post needs a title.', undefined, 'validation_failed');
      if (row.kind === 'text' && !body) throw unprocessable('A post cannot be empty. Delete it instead.', undefined, 'validation_failed');
      if (row.kind === 'article' && body.length < 200) throw unprocessable('Articles need at least 200 characters.', undefined, 'validation_failed');
      let visibility = b.visibility ?? row.visibility;
      if (bool(row.is_anonymous) || row.community_id) visibility = visibility === 'only_me' && !bool(row.is_anonymous) ? 'only_me' : 'members';
      await c.db.run('UPDATE posts SET title = $2, body = $3, tags = $4, visibility = $5, edited_at = $6 WHERE id = $1',
        [pid, title, body, b.tags ?? json(row.tags, []), visibility, c.now().toISOString()]);
      const [post] = await serializePosts(s, c.me.userId, [await c.db.get<any>(`${SELECT_POST} WHERE p.id = $1`, [pid])]);
      return { post };
    });

    router.delete('/api/posts/:id', { auth: 'active' }, async (c) => {
      const pid = id.safeParse(c.params.id);
      if (!pid.success) throw notFound();
      const row = await c.db.get<any>('SELECT id, author_id, status FROM posts WHERE id = $1', [pid.data]);
      if (!row || row.author_id !== c.me.userId) throw notFound('We couldn’t find that post.');
      await c.db.tx(async (t) => {
        // The words are erased right away; the row stays as a tombstone so reports and comment threads keep a stable reference.
        await t.run("UPDATE posts SET status = 'deleted', title = NULL, body = '', data = '{}', tags = '[]', deleted_at = $2 WHERE id = $1", [row.id, c.now().toISOString()]);
        await t.run('DELETE FROM post_media WHERE post_id = $1', [row.id]);
        await t.run("DELETE FROM saved_items WHERE kind = 'post' AND ref_id = $1", [row.id]);
        await t.run("UPDATE comments SET status = 'deleted', body = '', deleted_at = $2 WHERE post_id = $1 AND status = 'published'", [row.id, c.now().toISOString()]);
      });
      return { ok: true };
    });

    router.post('/api/posts/:id/vote', { auth: 'active', body: z.object({ option: z.number().int().min(0).max(POST_LIMITS.pollOptionsMax - 1) }).strict(), rate: { key: 'poll:vote', limit: 60, windowMs: 60_000 } }, async (c) => {
      const row = await loadVisiblePost(c.db, c.me.userId, id.parse(c.params.id));
      if (!row || row.kind !== 'poll') throw notFound('We couldn’t find that poll.');
      const data = json<any>(row.data, {});
      if (c.body.option >= (data.options?.length ?? 0)) throw badRequest('That option does not exist.');
      if (data.closesAt && new Date(data.closesAt) <= c.now()) throw conflict('This poll has closed.', 'poll_closed');
      const had = await c.db.get('SELECT 1 AS x FROM poll_votes WHERE post_id = $1 AND user_id = $2', [row.id, c.me.userId]);
      if (had) throw conflict('You have already voted. Votes cannot be changed.', 'already_voted');
      await c.db.run('INSERT INTO poll_votes (post_id, user_id, option_index, created_at) VALUES ($1,$2,$3,$4)', [row.id, c.me.userId, c.body.option, c.now().toISOString()]);
      const [post] = await serializePosts(s, c.me.userId, [row]);
      return { post };
    });

    // ───────── comments ─────────
    router.get('/api/posts/:id/comments', { auth: 'active' }, async (c) => {
      const post = await loadVisiblePost(c.db, c.me.userId, id.safeParse(c.params.id).data ?? '');
      if (!post) throw notFound('We couldn’t find that post.');
      // Comments by blocked people are hidden (their replies go with them). Anonymous comments are filtered by the real author's blocks too,
      // which reveals nothing about who wrote them.
      const rows = await c.db.query<any>(
        `SELECT cm.* FROM comments cm WHERE cm.post_id = $2 AND (cm.author_id IS NULL OR cm.author_id = $1 OR ${sqlNotBlocked('$1', 'cm.author_id')}) ORDER BY cm.created_at, cm.id LIMIT 500`, [c.me.userId, post.id]);
      const live = new Set<string>(); const out: any[] = [];
      for (const r of rows) { if (r.parent_id && !live.has(r.parent_id)) continue; live.add(r.id); out.push(r); }
      const items = await serializeComments(s, c.me.userId, out, await aliasMap(c.db, post.id));
      return { items, total: items.filter((i) => i.status === 'published').length } satisfies CommentsResponse;
    });

    const commentBody = z.object({ body: z.string().max(POST_LIMITS.commentMax), parentId: id.optional(), anonymous: z.boolean().default(false) }).strict();
    router.post('/api/posts/:id/comments', { auth: 'active', body: commentBody, rate: { key: 'comment:create', limit: 40, windowMs: 10 * 60_000 } }, async (c) => {
      const me = c.me.userId;
      const post = await loadVisiblePost(c.db, me, id.safeParse(c.params.id).data ?? '');
      if (!post) throw notFound('We couldn’t find that post.');
      const text = clean(c.body.body);
      if (!text) throw unprocessable('Write a comment first.', undefined, 'validation_failed');
      let anonymous = c.body.anonymous;
      const ownAnonPost = bool(post.is_anonymous) && post.author_id === me;
      if (ownAnonPost) anonymous = true; // replying under your own name to your anonymous post would unmask it
      if (anonymous) {
        if (!s.config.anonymousPostingEnabled) throw conflict('Anonymous posting is switched off.', 'anonymous_disabled');
        if (!post.community_id || !bool(post.c_anon)) throw conflict('This community does not allow anonymous comments.', 'anonymous_not_allowed');
        s.rate.check(`comment:anon:${me}`, 15, 3600_000);
      }
      let parent: any = null; let depth = 0; let parentId: string | null = null;
      if (c.body.parentId) {
        parent = await c.db.get<any>('SELECT * FROM comments WHERE id = $1 AND post_id = $2', [c.body.parentId, post.id]);
        if (!parent || parent.status !== 'published') throw notFound('That comment is no longer available to reply to.');
        if (parent.author_id && parent.author_id !== me) {
          const rel = await relation(c.db, me, parent.author_id);
          if (rel.blocked) throw notFound('That comment is no longer available to reply to.');
        }
        depth = Math.min(Number(parent.depth) + 1, POST_LIMITS.maxDepth);
        parentId = Number(parent.depth) >= POST_LIMITS.maxDepth ? parent.parent_id : parent.id;
      }
      const cid = uuid();
      await c.db.tx(async (t) => {
        await t.run('INSERT INTO comments (id, post_id, parent_id, author_id, body, is_anonymous, depth, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [cid, post.id, parentId, me, text, anonymous, depth, c.now().toISOString()]);
        if (anonymous) await aliasFor(t, post.id, me, ownAnonPost);
        const notified: string[] = [];
        if (parent?.author_id && parent.author_id !== me) {
          if (await notify(t, { userId: parent.author_id, type: 'reply', actorId: me, actorAnonymous: anonymous, targetType: 'comment', targetId: cid, data: { postId: post.id } }, c.now())) notified.push(parent.author_id);
        }
        if (post.author_id && post.author_id !== me && !notified.includes(post.author_id))
          await notify(t, { userId: post.author_id, type: 'comment', actorId: me, actorAnonymous: anonymous, targetType: 'comment', targetId: cid, data: { postId: post.id, postTitle: post.title ?? null } }, c.now());
        await notifyMentions(t, { actorId: me, anonymous, text, targetType: 'comment', targetId: cid, postId: post.id, now: c.now(), exclude: [post.author_id, parent?.author_id].filter(Boolean) });
      });
      const row = await c.db.get<any>('SELECT * FROM comments WHERE id = $1', [cid]);
      const [comment] = await serializeComments(s, me, [row], await aliasMap(c.db, post.id));
      return created({ comment, anonymityNote: anonymous && !c.body.anonymous ? 'Because this is your own anonymous post, your reply was also posted anonymously.' : null });
    });

    router.patch('/api/comments/:id', { auth: 'active', body: z.object({ body: z.string().max(POST_LIMITS.commentMax) }).strict(), rate: { key: 'comment:edit', limit: 60, windowMs: 10 * 60_000 } }, async (c) => {
      const row = await c.db.get<any>('SELECT * FROM comments WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!row || row.author_id !== c.me.userId) throw notFound();
      if (row.status !== 'published') throw conflict('This comment can no longer be edited.', 'not_editable');
      const text = clean(c.body.body);
      if (!text) throw unprocessable('A comment cannot be empty. Delete it instead.', undefined, 'validation_failed');
      await c.db.run('UPDATE comments SET body = $2, edited_at = $3 WHERE id = $1', [row.id, text, c.now().toISOString()]);
      const [comment] = await serializeComments(s, c.me.userId, [await c.db.get<any>('SELECT * FROM comments WHERE id = $1', [row.id])], await aliasMap(c.db, row.post_id));
      return { comment };
    });

    router.delete('/api/comments/:id', { auth: 'active' }, async (c) => {
      const row = await c.db.get<any>('SELECT * FROM comments WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!row || row.author_id !== c.me.userId) throw notFound();
      // Replies by other people stay readable beneath a tombstone; the words themselves are erased now.
      await c.db.run("UPDATE comments SET status = 'deleted', body = '', deleted_at = $2 WHERE id = $1", [row.id, c.now().toISOString()]);
      await c.db.run("DELETE FROM reactions WHERE target_type = 'comment' AND target_id = $1", [row.id]);
      return { ok: true };
    });

    // ───────── reactions ─────────
    router.put('/api/reactions', { auth: 'active', body: z.object({ targetType: z.enum(['post', 'comment']), targetId: id, kind: z.enum(REACTION_KINDS) }).strict(), rate: { key: 'reaction', limit: 240, windowMs: 60_000 } }, async (c) => {
      const me = c.me.userId;
      const { postId, authorId, anonymousAuthor } = await resolveTarget(c.db, me, c.body.targetType, c.body.targetId);
      await c.db.tx(async (t) => {
        const had = await t.get<{ kind: string }>('SELECT kind FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3', [c.body.targetType, c.body.targetId, me]);
        if (had) await t.run('UPDATE reactions SET kind = $4, created_at = $5 WHERE target_type = $1 AND target_id = $2 AND user_id = $3', [c.body.targetType, c.body.targetId, me, c.body.kind, c.now().toISOString()]);
        else {
          await t.run('INSERT INTO reactions (target_type, target_id, user_id, kind, created_at) VALUES ($1,$2,$3,$4,$5)', [c.body.targetType, c.body.targetId, me, c.body.kind, c.now().toISOString()]);
          // Reactions are always attributed to a real person (the reactor) — only content authors can be anonymous — so the actor is not anonymous.
          if (authorId) await notify(t, { userId: authorId, type: 'reaction', actorId: me, targetType: c.body.targetType, targetId: c.body.targetId, data: { postId, kind: c.body.kind } }, c.now());
        }
      });
      void anonymousAuthor;
      return { ok: true };
    });
    router.delete('/api/reactions', { auth: 'active', query: z.object({ targetType: z.enum(['post', 'comment']), targetId: id }) }, async (c) => {
      await c.db.run('DELETE FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3', [c.query.targetType, c.query.targetId, c.me.userId]);
      return { ok: true };
    });

    // ───────── profile activity ─────────
    // Only non-anonymous posts, only those the viewer may see, and only if the owner can be seen at all.
    router.get('/api/members/:handle/posts', { auth: 'active', query: z.object({ cursor: z.string().max(120).optional() }) }, async (c) => {
      const handle = String(c.params.handle).toLowerCase();
      const owner = await c.db.get<{ id: string }>("SELECT id FROM users WHERE lower(handle) = $1 AND status = 'active'", [handle]);
      if (!owner) throw notFound('We couldn’t find that member.');
      const { canOpenProfile } = await import('../policy/visibility');
      const gate = await canOpenProfile(c.db, c.me.userId, owner.id);
      if (!gate.ok) throw notFound('We couldn’t find that member.');
      const params: unknown[] = [c.me.userId, owner.id, false];
      let cur = '';
      if (c.query.cursor) { const [ca, ci] = c.query.cursor.split('|'); params.push(ca, ci); cur = ' AND (p.created_at < $4 OR (p.created_at = $4 AND p.id < $5))'; }
      const rows = await c.db.query<any>(`${SELECT_POST} WHERE p.author_id = $2 AND p.is_anonymous = $3 AND ${sqlPostVisible('$1')}${cur} ORDER BY p.created_at DESC, p.id DESC LIMIT 21`, params);
      const page = rows.slice(0, 20); const last = page[page.length - 1];
      return { items: await serializePosts(s, c.me.userId, page), nextCursor: rows.length > 20 && last ? `${last.created_at}|${last.id}` : null };
    });

    registerEraser('content', async (db, userId, ctx) => {
      const counts: Record<string, number> = {};
      const now = ctx.now.toISOString();
      counts.reactions = (await db.run('DELETE FROM reactions WHERE user_id = $1', [userId])).changes;
      // Comments others replied to become tombstones (so those replies stay readable); the rest are deleted outright.
      const withReplies = await db.run(
        `UPDATE comments SET author_id = NULL, status = 'deleted', body = '', deleted_at = $2 WHERE author_id = $1 AND EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = comments.id)`, [userId, now]);
      const rest = await db.run('DELETE FROM comments WHERE author_id = $1', [userId]);
      counts.comments = withReplies.changes + rest.changes;
      counts.posts = (await db.run('DELETE FROM posts WHERE author_id = $1', [userId])).changes; // cascades media links, votes, aliases
      counts.poll_votes = (await db.run('DELETE FROM poll_votes WHERE user_id = $1', [userId])).changes;
      await db.run('DELETE FROM post_anon_aliases WHERE user_id = $1', [userId]);
      return { counts };
    });
    registerExporter('content', async (db, userId) => ({
      posts: (await db.query<any>('SELECT id, kind, title, body, visibility, is_anonymous, tags, created_at, edited_at, status FROM posts WHERE author_id = $1 ORDER BY created_at', [userId])),
      comments: (await db.query<any>('SELECT id, post_id, body, is_anonymous, created_at, status FROM comments WHERE author_id = $1 ORDER BY created_at', [userId])),
      reactions: (await db.query<any>('SELECT target_type, target_id, kind, created_at FROM reactions WHERE user_id = $1', [userId])),
    }));
  },
};

/** Confirms the viewer may see a reaction target; returns the post it belongs to and who to notify. */
async function resolveTarget(db: Db, viewerId: string, type: 'post' | 'comment', targetId: string) {
  if (type === 'post') {
    const p = await loadVisiblePost(db, viewerId, targetId);
    if (!p) throw notFound('We couldn’t find that post.');
    return { postId: p.id as string, authorId: p.author_id as string | null, anonymousAuthor: bool(p.is_anonymous) };
  }
  const cm = await db.get<any>('SELECT * FROM comments WHERE id = $1 AND status = $2', [targetId, 'published']);
  if (!cm) throw notFound('We couldn’t find that comment.');
  const p = await loadVisiblePost(db, viewerId, cm.post_id);
  if (!p) throw notFound('We couldn’t find that comment.');
  if (cm.author_id && cm.author_id !== viewerId && (await relation(db, viewerId, cm.author_id)).blocked) throw notFound('We couldn’t find that comment.');
  return { postId: cm.post_id as string, authorId: cm.author_id as string | null, anonymousAuthor: bool(cm.is_anonymous) };
}
void forbidden; void audienceAllows; void audit; void (null as unknown as PostView);
export type { ReactionKind };
