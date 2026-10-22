import { z } from 'zod';
import type { Db } from '../db';
import { json } from '../db';
import { HANDLE_RE } from '../../shared/constants';
import { PROFILE_FIELDS, presetSettings, type PrivacySettings } from '../../shared/privacy';
import { mergeSettings, type Settings } from '../../shared/api/settings';
import { notFound } from '../http/errors';
import { relation, type Relation } from '../policy/visibility';
import type { RelationFlags } from '../../shared/api/social';

export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'support', 'help', 'freeverse', 'nova', 'founder', 'moderator', 'mod', 'system', 'staff', 'api', 'www', 'null', 'undefined',
  'anonymous', 'deleted', 'suggested', 'me', 'self', 'root', 'security', 'trust', 'safety', 'council', 'guardian', 'director', 'official', 'team',
  'athena', 'atlas', 'aegis', 'sage', 'pulse', 'forge', 'echo', 'compass',
]);

export const handleSchema = z.string().trim().toLowerCase().regex(HANDLE_RE, 'Use 3–24 letters, numbers, dots or underscores, starting with a letter or number.')
  .refine((h) => !RESERVED_HANDLES.has(h), 'That handle is reserved.');
export const handleParam = z.string().trim().toLowerCase().regex(HANDLE_RE);

/** Collapses whitespace and strips control characters and angle brackets so labels can never carry markup. */
export function cleanText(s: string, max: number): string {
  return s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function loadPrivacy(db: Db, userId: string): Promise<PrivacySettings> {
  const r = await db.get<any>('SELECT * FROM user_privacy WHERE user_id = $1', [userId]);
  if (!r) return presetSettings('balanced');
  const fv = json<Record<string, string>>(r.field_visibility, {});
  const clean: Record<string, string> = {};
  for (const f of PROFILE_FIELDS) if (typeof fv[f] === 'string') clean[f] = fv[f]!;
  return {
    preset: r.preset, profile_visibility: r.profile_visibility, discoverable: !!(r.discoverable === true || r.discoverable === 1),
    who_can_message: r.who_can_message, who_can_mention: r.who_can_mention, online_status_visibility: r.online_status_visibility,
    default_post_visibility: r.default_post_visibility, comments_on_profile: !!(r.comments_on_profile === true || r.comments_on_profile === 1),
    field_visibility: clean as PrivacySettings['field_visibility'],
  };
}

export async function loadSettings(db: Db, userId: string): Promise<Settings> {
  const r = await db.get<any>('SELECT notifications, messaging, accessibility, nova FROM user_settings WHERE user_id = $1', [userId]);
  if (!r) return mergeSettings(null);
  return mergeSettings({ notifications: json(r.notifications, {}), messaging: json(r.messaging, {}), accessibility: json(r.accessibility, {}), nova: json(r.nova, {}) });
}

export async function userByHandle(db: Db, handle: string): Promise<{ id: string; status: string; handle: string } | undefined> {
  return db.get('SELECT id, status, handle FROM users WHERE handle = $1', [handle.toLowerCase()]);
}

/** Resolves a handle to an active, non-blocked member the viewer can interact with, or throws 404 (never 403: it would leak). */
export async function requireVisibleMember(db: Db, viewerId: string, handle: string): Promise<{ id: string; handle: string; rel: Relation }> {
  const u = await userByHandle(db, handle);
  if (!u || u.status !== 'active') throw notFound('We couldn’t find that member.');
  const rel = await relation(db, viewerId, u.id);
  if (rel.blocked) throw notFound('We couldn’t find that member.');
  return { id: u.id, handle: u.handle, rel };
}

export async function relationFlags(db: Db, viewerId: string, ownerId: string): Promise<RelationFlags> {
  const rel = await relation(db, viewerId, ownerId);
  const muted = rel.self ? false : !!(await db.get('SELECT 1 AS x FROM mutes WHERE user_id = $1 AND muted_id = $2', [viewerId, ownerId]));
  return { following: rel.following, followedBy: rel.followedBy, connection: rel.connection, blockedByMe: rel.blockedByMe, muted };
}

export const isUniqueViolation = (e: unknown): boolean => {
  const m = e instanceof Error ? e.message : String(e);
  return /unique|duplicate key|constraint failed/i.test(m);
};
