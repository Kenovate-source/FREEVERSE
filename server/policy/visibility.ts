import type { Db } from '../db';
import type { Audience } from '../../shared/constants';

/**
 * Single source of truth for "who can see what". Privacy is enforced here, on the server. Anything that returns another
 * person's data must go through these helpers (SQL fragments for lists, JS helpers for single objects).
 *
 * Definitions:
 *  - blocked: either person has blocked the other (hides everything both ways).
 *  - connection: both people follow each other.
 *  - audience 'everyone' behaves like 'members' until signed-out pages exist.
 */

export interface Relation {
  self: boolean;
  blocked: boolean; // blocked in either direction
  blockedByMe: boolean;
  following: boolean; // viewer follows owner
  followedBy: boolean; // owner follows viewer
  connection: boolean; // mutual
}

export async function relation(db: Db, viewerId: string | null, ownerId: string): Promise<Relation> {
  if (!viewerId) return { self: false, blocked: false, blockedByMe: false, following: false, followedBy: false, connection: false };
  if (viewerId === ownerId) return { self: true, blocked: false, blockedByMe: false, following: false, followedBy: false, connection: false };
  const m = await relations(db, viewerId, [ownerId]);
  return m.get(ownerId)!;
}

/** Batch relations for many owners at once (avoids N+1 queries). */
export async function relations(db: Db, viewerId: string, ownerIds: string[]): Promise<Map<string, Relation>> {
  const out = new Map<string, Relation>();
  const ids = [...new Set(ownerIds)];
  for (const id of ids) out.set(id, { self: id === viewerId, blocked: false, blockedByMe: false, following: false, followedBy: false, connection: false });
  const others = ids.filter((i) => i !== viewerId);
  if (!others.length) return out;
  const ph = others.map((_, i) => `$${i + 2}`).join(', ');
  for (const r of await db.query<{ blocker_id: string; blocked_id: string }>(
    `SELECT blocker_id, blocked_id FROM blocks WHERE (blocker_id = $1 AND blocked_id IN (${ph})) OR (blocked_id = $1 AND blocker_id IN (${ph}))`, [viewerId, ...others])) {
    const other = r.blocker_id === viewerId ? r.blocked_id : r.blocker_id;
    const rel = out.get(other)!;
    rel.blocked = true;
    if (r.blocker_id === viewerId) rel.blockedByMe = true;
  }
  for (const r of await db.query<{ follower_id: string; followee_id: string }>(
    `SELECT follower_id, followee_id FROM follows WHERE (follower_id = $1 AND followee_id IN (${ph})) OR (followee_id = $1 AND follower_id IN (${ph}))`, [viewerId, ...others])) {
    if (r.follower_id === viewerId) out.get(r.followee_id)!.following = true; else out.get(r.follower_id)!.followedBy = true;
  }
  for (const rel of out.values()) rel.connection = rel.following && rel.followedBy;
  return out;
}

/** Can a viewer with this relationship see something shared with `audience`? */
export function audienceAllows(audience: Audience | string, rel: Relation): boolean {
  if (rel.self) return true;
  if (rel.blocked) return false;
  switch (audience) {
    case 'everyone':
    case 'members': return true;
    case 'connections': return rel.connection;
    default: return false; // only_me, unknown values fail closed
  }
}

// ───────────────────────── SQL fragments (for list queries that must paginate correctly) ─────────────────────────
// `v` is the placeholder holding the viewer id (e.g. "$1"); `col` is a column expression holding the other person's id.

export const sqlNotBlocked = (v: string, col: string): string =>
  `NOT EXISTS (SELECT 1 FROM blocks bk WHERE (bk.blocker_id = ${v} AND bk.blocked_id = ${col}) OR (bk.blocker_id = ${col} AND bk.blocked_id = ${v}))`;

export const sqlIsConnection = (v: string, col: string): string =>
  `(EXISTS (SELECT 1 FROM follows f1 WHERE f1.follower_id = ${v} AND f1.followee_id = ${col}) AND EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = ${col} AND f2.followee_id = ${v}))`;

/** Audience test for a column holding an Audience value, owner in `ownerCol`. Own content always passes. */
export const sqlAudienceAllows = (v: string, ownerCol: string, audienceCol: string): string =>
  `(${ownerCol} = ${v} OR (${sqlNotBlocked(v, ownerCol)} AND (${audienceCol} IN ('everyone','members') OR (${audienceCol} = 'connections' AND ${sqlIsConnection(v, ownerCol)}))))`;

/**
 * A published post the viewer may see, for a post aliased `p` (and its author as `pu`, joined by the caller:
 * `LEFT JOIN users pu ON pu.id = p.author_id`). Anonymous posts are filtered by the real author's blocks too,
 * without revealing anything about the author.
 */
export const sqlPostVisible = (v: string, p = 'p', pu = 'pu'): string =>
  `(${p}.status = 'published' AND ${pu}.id IS NOT NULL AND (${p}.author_id = ${v} OR (${pu}.status = 'active' AND ${sqlAudienceAllows(v, `${p}.author_id`, `${p}.visibility`)})))`;

/** Can the viewer open this person's profile page at all? (Per-field audiences then apply inside it.) */
export async function canOpenProfile(db: Db, viewerId: string, ownerId: string): Promise<{ ok: boolean; rel: Relation; owner: { status: string } | null }> {
  const rel = await relation(db, viewerId, ownerId);
  const owner = await db.get<{ status: string; profile_visibility: string | null }>(
    'SELECT u.status, p.profile_visibility FROM users u LEFT JOIN user_privacy p ON p.user_id = u.id WHERE u.id = $1', [ownerId]);
  if (!owner || owner.status === 'deleted' || owner.status === 'ineligible' || owner.status === 'pending_eligibility') return { ok: false, rel, owner: null };
  if (rel.self) return { ok: true, rel, owner };
  if (rel.blocked || owner.status !== 'active') return { ok: false, rel, owner };
  return { ok: audienceAllows(owner.profile_visibility ?? 'members', rel), rel, owner };
}
