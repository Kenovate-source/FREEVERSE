import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, notFound } from '../http/errors';
import { contains, json, placeholders } from '../db';
import { audienceAllows, relations, sqlIsConnection, sqlNotBlocked, type Relation } from '../policy/visibility';
import { fieldAudience, type PrivacySettings } from '../../shared/privacy';
import { personCards, type PersonCard } from '../services/people';
import { notify } from '../services/notify';
import { registerEraser, registerExporter } from '../services/erasure';
import { handleParam, loadPrivacy, relationFlags, requireVisibleMember, userByHandle } from '../profile/common';
import { ARCHETYPES } from '../../shared/constants';
import type { MemberListItem, RelationFlags } from '../../shared/api/social';
import type { Services } from '../services';

const BATCH = 80;

interface DiscoverOpts { q?: string; interest?: string; identity?: string; cursor?: string | null; limit: number; onlySharing?: boolean; excludeFollowing?: boolean }

export async function discover(s: Services, viewerId: string, o: DiscoverOpts): Promise<{ items: MemberListItem[]; nextCursor: string | null }> {
  const mine = await s.db.query<{ key: string; label: string }>("SELECT key, label FROM user_tags WHERE user_id = $1 AND kind = 'interest'", [viewerId]);
  const mineKeys = new Map(mine.map((m) => [m.key, m.label]));
  if (o.onlySharing && !mineKeys.size) return { items: [], nextCursor: null };
  const q = o.q?.trim().toLowerCase();
  const out: MemberListItem[] = [];
  let cursor = o.cursor ?? null;
  let lastScanned: { created_at: string; id: string } | null = null;
  let exhausted = false;

  for (let round = 0; round < 8 && out.length <= o.limit && !exhausted; round++) {
    const params: unknown[] = [viewerId, true];
    const where: string[] = [
      "u.status = 'active'", 'u.id <> $1', 'pr.discoverable = $2', sqlNotBlocked('$1', 'u.id'),
      `(pr.profile_visibility IN ('everyone','members') OR (pr.profile_visibility = 'connections' AND ${sqlIsConnection('$1', 'u.id')}))`,
    ];
    const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
    if (cursor) {
      const [ca, ci] = cursor.split('|');
      const a = p(ca), b = p(ci);
      where.push(`(u.created_at < ${a} OR (u.created_at = ${a} AND u.id < ${b}))`);
    }
    if (q) {
      const l = p(contains(q));
      where.push(`(lower(u.handle) LIKE ${l} ESCAPE '\\' OR lower(u.display_name) LIKE ${l} ESCAPE '\\' OR lower(COALESCE(p.headline,'')) LIKE ${l} ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM user_tags t WHERE t.user_id = u.id AND t.kind = 'interest' AND lower(t.label) LIKE ${l} ESCAPE '\\'))`);
    }
    if (o.interest) where.push(`EXISTS (SELECT 1 FROM user_tags t WHERE t.user_id = u.id AND t.kind = 'interest' AND t.key = ${p(o.interest)})`);
    if (o.identity) where.push(`EXISTS (SELECT 1 FROM user_identities ui WHERE ui.user_id = u.id AND ui.archetype = ${p(o.identity)} AND ui.status = 'active')`);
    if (o.excludeFollowing) where.push('NOT EXISTS (SELECT 1 FROM follows fx WHERE fx.follower_id = $1 AND fx.followee_id = u.id)');
    if (o.onlySharing) where.push(`EXISTS (SELECT 1 FROM user_tags t WHERE t.user_id = u.id AND t.kind = 'interest' AND t.key IN (${[...mineKeys.keys()].map((k) => p(k)).join(', ')}))`);
    const rows = await s.db.query<any>(
      `SELECT u.id, u.handle, u.display_name, u.created_at, pr.field_visibility, p.headline
         FROM users u JOIN user_privacy pr ON pr.user_id = u.id LEFT JOIN profiles p ON p.user_id = u.id
        WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC, u.id DESC LIMIT ${BATCH}`, params);
    if (rows.length < BATCH) exhausted = true;
    if (!rows.length) break;
    const ids = rows.map((r) => r.id as string);
    const rel = await relations(s.db, viewerId, ids);
    const tags = await s.db.query<any>(`SELECT user_id, key, label FROM user_tags WHERE kind = 'interest' AND user_id IN (${placeholders(1, ids.length)})`, ids);
    const tagsBy = new Map<string, { key: string; label: string }[]>();
    for (const t of tags) (tagsBy.get(t.user_id) ?? tagsBy.set(t.user_id, []).get(t.user_id)!).push({ key: t.key, label: t.label });
    const idents = o.identity ? await s.db.query<any>(`SELECT user_id, visibility FROM user_identities WHERE archetype = $1 AND status = 'active' AND user_id IN (${placeholders(2, ids.length)})`, [o.identity, ...ids]) : [];
    const cards = await personCards(s, viewerId, ids);
    const mutes = new Set((await s.db.query<{ muted_id: string }>(`SELECT muted_id FROM mutes WHERE user_id = $1 AND muted_id IN (${placeholders(2, ids.length)})`, [viewerId, ...ids])).map((m) => m.muted_id));
    for (const r of rows) {
      lastScanned = { created_at: r.created_at, id: r.id };
      const rl: Relation = rel.get(r.id)!;
      const priv: Pick<PrivacySettings, 'field_visibility'> = { field_visibility: json(r.field_visibility, {}) };
      const interestsVisible = audienceAllows(fieldAudience(priv, 'interests'), rl);
      const theirs = interestsVisible ? tagsBy.get(r.id) ?? [] : [];
      const shared = theirs.filter((t) => mineKeys.has(t.key)).map((t) => ({ key: t.key, label: t.label }));
      if (o.onlySharing && !shared.length) continue;
      if (o.interest && !theirs.some((t) => t.key === o.interest)) continue;
      if (o.identity) {
        const ok = audienceAllows(fieldAudience(priv, 'identities'), rl) && idents.some((i: any) => i.user_id === r.id && audienceAllows(i.visibility, rl));
        if (!ok) continue;
      }
      if (q) {
        const headlineOk = audienceAllows(fieldAudience(priv, 'headline'), rl) && (r.headline ?? '').toLowerCase().includes(q);
        const direct = (r.handle ?? '').toLowerCase().includes(q) || (r.display_name ?? '').toLowerCase().includes(q);
        const interestOk = theirs.some((t) => t.label.toLowerCase().includes(q));
        if (!direct && !headlineOk && !interestOk) continue;
      }
      const card = cards.get(r.id);
      if (!card || card.deleted || card.restricted) continue;
      const relation: RelationFlags = { following: rl.following, followedBy: rl.followedBy, connection: rl.connection, blockedByMe: rl.blockedByMe, muted: mutes.has(r.id) };
      out.push({ person: card, sharedInterests: shared, relation, ...(shared.length ? { reason: `You both like ${shared.slice(0, 3).map((x) => x.label).join(', ')}` } : {}) });
      if (out.length > o.limit) break;
    }
    cursor = lastScanned ? `${lastScanned.created_at}|${lastScanned.id}` : cursor;
  }
  const more = out.length > o.limit;
  const items = out.slice(0, o.limit);
  let nextCursor: string | null = null;
  if (more || !exhausted) {
    // Resume after the last item actually returned, so nothing is skipped.
    const last = items[items.length - 1];
    if (last?.person.id) {
      const row = await s.db.get<{ created_at: string }>('SELECT created_at FROM users WHERE id = $1', [last.person.id]);
      nextCursor = row ? `${row.created_at}|${last.person.id}` : null;
    }
  }
  return { items, nextCursor: more || (!exhausted && items.length) ? nextCursor : null };
}

async function listPeople(s: Services, viewerId: string, sql: string, params: unknown[]): Promise<PersonCard[]> {
  const rows = await s.db.query<{ uid: string }>(sql, params);
  const cards = await personCards(s, viewerId, rows.map((r) => r.uid));
  return rows.map((r) => cards.get(r.uid)).filter((c): c is PersonCard => !!c && !c.deleted && !c.restricted);
}

export const socialModule: ModuleDef = {
  name: 'social',
  register(router, s) {
    router.get('/api/members', {
      auth: 'active',
      query: z.object({ q: z.string().max(60).optional(), interest: z.string().max(60).optional(), identity: z.enum(ARCHETYPES).optional(), cursor: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }),
      rate: { key: 'members:search', limit: 60, windowMs: 60_000 },
    }, async (c) => discover(s, c.me.userId, { ...c.query, limit: c.query.limit }));

    // Registered before /api/members/:handle so "suggested" is never read as a handle.
    router.get('/api/members/suggested', { auth: 'active' }, async (c) => {
      const r = await discover(s, c.me.userId, { limit: 60, onlySharing: true, excludeFollowing: true });
      const items = r.items.sort((a, b) => b.sharedInterests.length - a.sharedInterests.length).slice(0, 12);
      return { items, nextCursor: null };
    });

    router.post('/api/members/:handle/follow', { auth: 'active', rate: { key: 'follow', limit: 60, windowMs: 10 * 60_000 } }, async (c) => {
      const h = handleParam.safeParse(c.params.handle);
      if (!h.success) throw notFound('We couldn’t find that member.');
      const t = await requireVisibleMember(c.db, c.me.userId, h.data);
      if (t.rel.self) throw badRequest('You can’t follow yourself.');
      const r = await c.db.run('INSERT INTO follows (follower_id, followee_id, created_at) VALUES ($1,$2,$3) ON CONFLICT (follower_id, followee_id) DO NOTHING', [c.me.userId, t.id, c.now().toISOString()]);
      if (r.changes) await notify(c.db, { userId: t.id, type: 'follow', actorId: c.me.userId, targetType: 'user', targetId: c.me.userId }, c.now());
      return { relation: await relationFlags(c.db, c.me.userId, t.id) };
    });

    router.delete('/api/members/:handle/follow', { auth: 'active' }, async (c) => {
      const h = handleParam.safeParse(c.params.handle);
      if (!h.success) throw notFound('We couldn’t find that member.');
      const u = await userByHandle(c.db, h.data);
      if (!u) throw notFound('We couldn’t find that member.');
      await c.db.run('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [c.me.userId, u.id]);
      return { relation: await relationFlags(c.db, c.me.userId, u.id) };
    });

    for (const dir of ['followers', 'following'] as const) {
      router.get(`/api/members/:handle/${dir}`, { auth: 'active' }, async (c) => {
        const h = handleParam.safeParse(c.params.handle);
        if (!h.success) throw notFound('We couldn’t find that member.');
        const t = await requireVisibleMember(c.db, c.me.userId, h.data);
        const priv = await loadPrivacy(c.db, t.id);
        if (!t.rel.self && !audienceAllows(fieldAudience(priv, 'connections'), t.rel)) return { items: [], hidden: true };
        const [mine, theirs] = dir === 'followers' ? ['follower_id', 'followee_id'] : ['followee_id', 'follower_id'];
        const items = await listPeople(s, c.me.userId,
          `SELECT f.${mine} AS uid FROM follows f JOIN users u ON u.id = f.${mine} WHERE f.${theirs} = $1 AND u.status = 'active' AND ${sqlNotBlocked('$2', `f.${mine}`)} ORDER BY f.created_at DESC LIMIT 100`, [t.id, c.me.userId]);
        return { items, hidden: false };
      });
    }

    router.get('/api/connections', { auth: 'active' }, async (c) => ({
      items: await listPeople(s, c.me.userId,
        `SELECT a.followee_id AS uid FROM follows a JOIN follows b ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id JOIN users u ON u.id = a.followee_id
          WHERE a.follower_id = $1 AND u.status = 'active' AND ${sqlNotBlocked('$1', 'a.followee_id')} ORDER BY a.created_at DESC LIMIT 200`, [c.me.userId]),
      hidden: false,
    }));

    // ───────── block & mute ─────────
    router.post('/api/blocks/:handle', { auth: 'active', rate: { key: 'block', limit: 60, windowMs: 10 * 60_000 } }, async (c) => {
      const h = handleParam.safeParse(c.params.handle);
      if (!h.success) throw notFound('We couldn’t find that member.');
      const u = await userByHandle(c.db, h.data);
      if (!u || u.status !== 'active') throw notFound('We couldn’t find that member.');
      if (u.id === c.me.userId) throw badRequest('You can’t block yourself.');
      await c.db.tx(async (t) => {
        await t.run('DELETE FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)', [c.me.userId, u.id]);
        await t.run('DELETE FROM mutes WHERE user_id = $1 AND muted_id = $2', [c.me.userId, u.id]);
        await t.run('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1,$2,$3) ON CONFLICT (blocker_id, blocked_id) DO NOTHING', [c.me.userId, u.id, c.now().toISOString()]);
      });
      return { ok: true };
    });
    router.delete('/api/blocks/:handle', { auth: 'active' }, async (c) => {
      const h = handleParam.safeParse(c.params.handle);
      if (!h.success) throw notFound('We couldn’t find that member.');
      const u = await userByHandle(c.db, h.data);
      if (!u) throw notFound('We couldn’t find that member.');
      await c.db.run('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [c.me.userId, u.id]);
      return { ok: true };
    });
    router.get('/api/blocks', { auth: 'active' }, async (c) => {
      // Built directly (not personCards, which deliberately hides blocked people) so the list can offer "Unblock".
      const rows = await c.db.query<any>(
        `SELECT u.id, u.handle, u.display_name, p.avatar_config FROM blocks b JOIN users u ON u.id = b.blocked_id LEFT JOIN profiles p ON p.user_id = u.id
          WHERE b.blocker_id = $1 AND u.status = 'active' ORDER BY b.created_at DESC`, [c.me.userId]);
      const items: PersonCard[] = rows.map((r) => ({ id: r.id, handle: r.handle, displayName: r.display_name ?? 'Member', headline: null, avatar: { mode: 'avatar', config: json(r.avatar_config, {}), photoUrl: null }, isSelf: false, deleted: false, restricted: false, isDemo: false }));
      return { items };
    });

    router.post('/api/mutes/:handle', { auth: 'active' }, async (c) => {
      const h = handleParam.safeParse(c.params.handle);
      if (!h.success) throw notFound('We couldn’t find that member.');
      const t = await requireVisibleMember(c.db, c.me.userId, h.data);
      if (t.rel.self) throw badRequest('You can’t mute yourself.');
      await c.db.run('INSERT INTO mutes (user_id, muted_id, created_at) VALUES ($1,$2,$3) ON CONFLICT (user_id, muted_id) DO NOTHING', [c.me.userId, t.id, c.now().toISOString()]);
      return { ok: true };
    });
    router.delete('/api/mutes/:handle', { auth: 'active' }, async (c) => {
      const h = handleParam.safeParse(c.params.handle);
      if (!h.success) throw notFound('We couldn’t find that member.');
      const u = await userByHandle(c.db, h.data);
      if (!u) throw notFound('We couldn’t find that member.');
      await c.db.run('DELETE FROM mutes WHERE user_id = $1 AND muted_id = $2', [c.me.userId, u.id]);
      return { ok: true };
    });
    router.get('/api/mutes', { auth: 'active' }, async (c) => ({
      items: await listPeople(s, c.me.userId, `SELECT m.muted_id AS uid FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.user_id = $1 AND u.status = 'active' ORDER BY m.created_at DESC`, [c.me.userId]),
    }));

    registerEraser('social', async (db, userId) => {
      const counts: Record<string, number> = {};
      counts.follows = (await db.run('DELETE FROM follows WHERE follower_id = $1 OR followee_id = $1', [userId])).changes;
      counts.blocks = (await db.run('DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1', [userId])).changes;
      counts.mutes = (await db.run('DELETE FROM mutes WHERE user_id = $1 OR muted_id = $1', [userId])).changes;
      return { counts };
    });
    registerExporter('social', async (db, userId) => ({
      following: (await db.query<any>('SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = $1', [userId])),
      followers: (await db.query<any>('SELECT u.handle, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = $1', [userId])),
      blocked: (await db.query<any>('SELECT u.handle, b.created_at FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1', [userId])),
      muted: (await db.query<any>('SELECT u.handle, m.created_at FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.user_id = $1', [userId])),
    }));
  },
};
