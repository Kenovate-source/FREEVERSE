import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, notFound } from '../http/errors';
import { json, placeholders } from '../db';
import { AVATAR_EYES, AVATAR_EXTRAS, AVATAR_MOUTHS, AVATAR_PALETTES, AVATAR_SHAPES, COVER_PRESETS } from '../../shared/avatar';
import { GENDER_OPTIONS, type MemberProfile, type MyProfile, type Personalization, type TagItem } from '../../shared/api/profile';
import { INTERESTS, INTEREST_CATEGORIES, LEARN_TOPICS, CONTENT_CATEGORIES, PARTICIPATION_STYLES, CREATIVE_INTERESTS, CAREER_INTERESTS, GOAL_SUGGESTIONS, PERSONALIZATION_LIMITS, slugify } from '../../shared/interests';
import { TAG_KINDS, type TagKind } from '../../shared/constants';
import { audienceAllows, canOpenProfile } from '../policy/visibility';
import { fieldAudience, type PrivacySettings, type ProfileField } from '../../shared/privacy';
import { personCards } from '../services/people';
import { signedMediaUrl } from '../services/media-urls';
import { ageBand } from '../domain/eligibility';
import { registerEraser, registerExporter } from '../services/erasure';
import { cleanText, handleParam, handleSchema, isUniqueViolation, loadPrivacy, relationFlags, userByHandle } from '../profile/common';
import type { Services } from '../services';
import type { Db } from '../db';

const ONLINE_WINDOW_MS = 5 * 60_000;
const GENDERS = GENDER_OPTIONS.map((g) => g.value) as [string, ...string[]];

const avatarConfigSchema = z.object({
  seed: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/).optional(),
  palette: z.enum(AVATAR_PALETTES.map((p) => p.id) as [string, ...string[]]).optional(),
  shape: z.enum(AVATAR_SHAPES).optional(),
  eyes: z.enum(AVATAR_EYES).optional(),
  mouth: z.enum(AVATAR_MOUTHS).optional(),
  extra: z.enum(AVATAR_EXTRAS).optional(),
}).strict();

const optText = (max: number) => z.string().max(max * 2).nullable().optional().transform((v) => (v === undefined ? undefined : v === null ? null : cleanText(v, max) || null));

const profilePatch = z.object({
  displayName: z.string().min(1).max(80).transform((v) => cleanText(v, 40)).refine((v) => v.length >= 2, 'Use at least 2 characters.').optional(),
  handle: handleSchema.optional(),
  headline: optText(80),
  bio: z.string().max(1500).nullable().optional().transform((v) => (v === undefined ? undefined : v === null ? null : v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').trim().slice(0, 500) || null)),
  pronouns: optText(30),
  gender: z.enum(GENDERS).nullable().optional(),
  genderSelfDescription: optText(40),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
}).strict();

const kindSchema = z.enum(TAG_KINDS);
const catalogFor = (kind: TagKind): Map<string, { label: string; category: string | null }> | null => {
  switch (kind) {
    case 'interest': return new Map(INTERESTS.map((i) => [i.key, { label: i.label, category: i.category }]));
    case 'learn_topic': return new Map(LEARN_TOPICS.map((o) => [o.key, { label: o.label, category: null }]));
    case 'content_category': return new Map(CONTENT_CATEGORIES.map((o) => [o.key, { label: o.label, category: null }]));
    case 'participation': return new Map(PARTICIPATION_STYLES.map((o) => [o.key, { label: o.label, category: null }]));
    case 'creative': return new Map(CREATIVE_INTERESTS.map((o) => [o.key, { label: o.label, category: null }]));
    case 'career': return new Map(CAREER_INTERESTS.map((o) => [o.key, { label: o.label, category: null }]));
    case 'goal': return new Map(GOAL_SUGGESTIONS.map((o) => [o.key, { label: o.label, category: null }]));
    default: return null; // community_interest, skill: free-form
  }
};

export async function loadTags(db: Db, userId: string): Promise<Personalization> {
  const out = Object.fromEntries(TAG_KINDS.map((k) => [k, [] as TagItem[]])) as unknown as Personalization;
  const rows = await db.query<any>('SELECT kind, key, label, category, is_custom FROM user_tags WHERE user_id = $1 ORDER BY created_at, key', [userId]);
  for (const r of rows) out[r.kind as TagKind]?.push({ key: r.key, label: r.label, category: r.category ?? null, isCustom: r.is_custom === true || r.is_custom === 1 });
  return out;
}

async function myProfile(s: Services, userId: string): Promise<MyProfile> {
  const r = await s.db.get<any>(
    `SELECT u.handle, u.display_name, p.headline, p.bio, p.pronouns, p.gender, p.gender_self_description, p.accent, p.avatar_mode, p.avatar_config, p.avatar_media_id,
            p.cover_mode, p.cover_preset, p.cover_media_id FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`, [userId]);
  if (!r) throw notFound();
  return {
    handle: r.handle, displayName: r.display_name ?? 'Member', headline: r.headline ?? null, bio: r.bio ?? null, pronouns: r.pronouns ?? null,
    gender: r.gender ?? null, genderSelfDescription: r.gender_self_description ?? null, accent: r.accent ?? null,
    avatar: { mode: r.avatar_mode, config: json(r.avatar_config, {}), photoMediaId: r.avatar_media_id ?? null, photoUrl: r.avatar_media_id ? signedMediaUrl(s, userId, r.avatar_media_id) : null },
    cover: { mode: r.cover_mode, presetId: r.cover_preset ?? null, mediaId: r.cover_media_id ?? null, imageUrl: r.cover_media_id ? signedMediaUrl(s, userId, r.cover_media_id) : null },
  };
}

async function ownedMedia(db: Db, userId: string, mediaId: string, purpose: 'avatar' | 'cover') {
  const m = await db.get('SELECT id FROM media WHERE id = $1 AND owner_id = $2 AND purpose = $3 AND deleted_at IS NULL', [mediaId, userId, purpose]);
  if (!m) throw badRequest(`That ${purpose} image was not found. Upload it first.`, undefined, 'media_not_found');
}

export const profilesModule: ModuleDef = {
  name: 'profiles',
  register(router, s) {
    router.get('/api/profile', { auth: 'active' }, async (c) => ({ profile: await myProfile(s, c.me.userId) }));

    // Live availability check for the handle field. Rate-limited so it cannot be used to enumerate members.
    router.get('/api/handles/check', { auth: 'active', query: z.object({ handle: z.string().max(40) }), rate: { key: 'handle:check', limit: 60, windowMs: 10 * 60_000 } }, async (c) => {
      const h = handleSchema.safeParse(c.query.handle);
      if (!h.success) return { available: false, reason: h.error.issues[0]?.message ?? 'That handle isn’t valid.' };
      const mine = await c.db.get('SELECT 1 AS x FROM users WHERE handle = $1 AND id = $2', [h.data, c.me.userId]);
      if (mine) return { available: true, reason: 'This is your current handle.' };
      const taken = await c.db.get('SELECT 1 AS x FROM users WHERE handle = $1', [h.data]);
      return taken ? { available: false, reason: 'That handle is already taken.' } : { available: true, reason: 'Available.' };
    });

    router.patch('/api/profile', { auth: 'active', body: profilePatch, rate: { key: 'profile:patch', limit: 60, windowMs: 10 * 60_000 } }, async (c) => {
      const b = c.body as z.infer<typeof profilePatch>;
      const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        if (b.handle !== undefined || b.displayName !== undefined) {
          if (b.handle !== undefined) {
            const taken = await t.get('SELECT 1 AS x FROM users WHERE handle = $1 AND id <> $2', [b.handle, c.me.userId]);
            if (taken) throw conflict('That handle is already taken.', 'handle_taken');
          }
          try {
            await t.run('UPDATE users SET handle = COALESCE($2, handle), display_name = COALESCE($3, display_name), updated_at = $4 WHERE id = $1', [c.me.userId, b.handle ?? null, b.displayName ?? null, now]);
          } catch (e) { if (isUniqueViolation(e)) throw conflict('That handle is already taken.', 'handle_taken'); throw e; }
        }
        const sets: string[] = []; const vals: unknown[] = [c.me.userId]; const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
        if (b.headline !== undefined) add('headline', b.headline);
        if (b.bio !== undefined) add('bio', b.bio);
        if (b.pronouns !== undefined) add('pronouns', b.pronouns);
        if (b.accent !== undefined) add('accent', b.accent);
        if (b.gender !== undefined) {
          add('gender', b.gender);
          if (b.gender !== 'self_described') add('gender_self_description', null);
        }
        if (b.genderSelfDescription !== undefined && b.gender === undefined) {
          const cur = await t.get<{ gender: string | null }>('SELECT gender FROM profiles WHERE user_id = $1', [c.me.userId]);
          if (cur?.gender === 'self_described') add('gender_self_description', b.genderSelfDescription);
        } else if (b.genderSelfDescription !== undefined && b.gender === 'self_described') add('gender_self_description', b.genderSelfDescription);
        if (sets.length) { add('updated_at', now); await t.run(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = $1`, vals); }
      });
      return { profile: await myProfile(s, c.me.userId) };
    });

    router.put('/api/profile/avatar', {
      auth: 'active',
      body: z.object({ mode: z.enum(['avatar', 'photo', 'both']), config: avatarConfigSchema.optional(), photoMediaId: z.string().uuid().nullable().optional() }).strict(),
    }, async (c) => {
      const b = c.body as { mode: 'avatar' | 'photo' | 'both'; config?: Record<string, unknown>; photoMediaId?: string | null };
      const cur = await c.db.get<any>('SELECT avatar_config, avatar_media_id FROM profiles WHERE user_id = $1', [c.me.userId]);
      let mediaId: string | null = b.photoMediaId === undefined ? cur?.avatar_media_id ?? null : b.photoMediaId;
      if (mediaId) await ownedMedia(c.db, c.me.userId, mediaId, 'avatar');
      if (b.mode !== 'avatar' && !mediaId) throw badRequest('Upload a photo first, or choose an avatar only.', undefined, 'photo_required');
      if (b.mode === 'avatar' && b.photoMediaId === null) mediaId = null;
      const keepSeed = (json<Record<string, unknown>>(cur?.avatar_config, {}) as { seed?: string }).seed;
      const config = { ...(b.config ?? json<Record<string, unknown>>(cur?.avatar_config, {})), ...(keepSeed && !(b.config?.seed) ? { seed: keepSeed } : {}) };
      await c.db.run('UPDATE profiles SET avatar_mode = $2, avatar_config = $3, avatar_media_id = $4, updated_at = $5 WHERE user_id = $1', [c.me.userId, b.mode, config, mediaId, c.now().toISOString()]);
      return { profile: await myProfile(s, c.me.userId) };
    });

    router.put('/api/profile/cover', {
      auth: 'active',
      body: z.object({ mode: z.enum(['preset', 'image']), presetId: z.enum(COVER_PRESETS.map((p) => p.id) as [string, ...string[]]).nullable().optional(), mediaId: z.string().uuid().nullable().optional() }).strict(),
    }, async (c) => {
      const b = c.body as { mode: 'preset' | 'image'; presetId?: string | null; mediaId?: string | null };
      if (b.mode === 'image') {
        if (!b.mediaId) throw badRequest('Choose an uploaded cover image.', undefined, 'media_required');
        await ownedMedia(c.db, c.me.userId, b.mediaId, 'cover');
        await c.db.run("UPDATE profiles SET cover_mode = 'image', cover_media_id = $2, updated_at = $3 WHERE user_id = $1", [c.me.userId, b.mediaId, c.now().toISOString()]);
      } else {
        await c.db.run("UPDATE profiles SET cover_mode = 'preset', cover_preset = COALESCE($2, cover_preset), cover_media_id = NULL, updated_at = $3 WHERE user_id = $1", [c.me.userId, b.presetId ?? null, c.now().toISOString()]);
      }
      return { profile: await myProfile(s, c.me.userId) };
    });

    // ───────── personalization ─────────
    router.get('/api/catalog/interests', { auth: 'active' }, async () => ({
      categories: INTEREST_CATEGORIES, interests: INTERESTS,
      suggestions: { learn_topic: LEARN_TOPICS, content_category: CONTENT_CATEGORIES, participation: PARTICIPATION_STYLES, creative: CREATIVE_INTERESTS, career: CAREER_INTERESTS, goal: GOAL_SUGGESTIONS, community_interest: [] },
      limits: PERSONALIZATION_LIMITS,
    }));

    router.get('/api/personalization', { auth: 'active' }, async (c) => ({ personalization: await loadTags(c.db, c.me.userId) }));

    router.put('/api/personalization', {
      auth: 'active',
      rate: { key: 'personalization', limit: 60, windowMs: 10 * 60_000 },
      body: z.object({
        kind: kindSchema,
        items: z.array(z.object({ key: z.string().max(60).optional(), label: z.string().min(1).max(120), category: z.string().max(60).nullable().optional(), isCustom: z.boolean().optional() }).strict()).max(PERSONALIZATION_LIMITS.perKind),
      }).strict(),
    }, async (c) => {
      const { kind, items } = c.body as { kind: TagKind; items: { key?: string; label: string; isCustom?: boolean }[] };
      const cat = catalogFor(kind);
      const final = new Map<string, { label: string; category: string | null; custom: boolean }>();
      for (const it of items) {
        const known = it.key && !it.isCustom ? cat?.get(it.key) : undefined;
        if (known && it.key) { final.set(it.key, { label: known.label, category: known.category, custom: false }); continue; }
        const label = cleanText(it.label, PERSONALIZATION_LIMITS.customLabelMax);
        const slug = slugify(label);
        if (!label || !slug) continue;
        const key = `custom-${slug}`;
        final.set(key, { label, category: null, custom: true });
      }
      const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        await t.run('DELETE FROM user_tags WHERE user_id = $1 AND kind = $2', [c.me.userId, kind]);
        for (const [key, v] of final) await t.run('INSERT INTO user_tags (user_id, kind, key, label, category, is_custom, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [c.me.userId, kind, key, v.label, v.category, v.custom, now]);
      });
      return { personalization: await loadTags(c.db, c.me.userId) };
    });

    // ───────── another member's profile, as this viewer may see it ─────────
    router.get('/api/members/:handle', { auth: 'active' }, async (c) => {
      const hp = handleParam.safeParse(c.params.handle);
      if (!hp.success) throw notFound('We couldn’t find that member.');
      const u = await userByHandle(c.db, hp.data);
      if (!u) throw notFound('We couldn’t find that member.');
      const viewer = c.me.userId;
      const gate = await canOpenProfile(c.db, viewer, u.id);
      if (!gate.owner || gate.rel.blocked) throw notFound('We couldn’t find that member.');
      const rel = gate.rel;
      const relation = await relationFlags(c.db, viewer, u.id);
      const card = (await personCards(s, viewer, [u.id])).get(u.id)!;
      if (!gate.ok) {
        // The profile is not open to this viewer: a minimal stub, with nothing the person made conditional on audience.
        return { profile: { restricted: true, person: { ...card, headline: null }, relation } satisfies MemberProfile };
      }
      const priv: PrivacySettings = await loadPrivacy(c.db, u.id);
      const can = (f: ProfileField) => audienceAllows(fieldAudience(priv, f), rel);
      const row = await c.db.get<any>(
        `SELECT p.bio, p.pronouns, p.gender, p.gender_self_description, p.accent, p.cover_mode, p.cover_preset, p.cover_media_id, x.birth_month, x.birth_year, x.last_seen_at
           FROM users x JOIN profiles p ON p.user_id = x.id WHERE x.id = $1`, [u.id]);
      const out: MemberProfile = { restricted: false, person: card, relation };
      if (can('bio')) out.bio = row.bio ?? null;
      if (can('pronouns')) out.pronouns = row.pronouns ?? null;
      if (can('gender')) out.gender = row.gender === 'self_described' ? row.gender_self_description ?? null : row.gender ?? null;
      if (can('age_range') && row.birth_month && row.birth_year) out.ageBand = ageBand(Number(row.birth_month), Number(row.birth_year), c.now());
      if (can('cover')) out.cover = { mode: row.cover_mode, presetId: row.cover_preset ?? null, imageUrl: row.cover_mode === 'image' && row.cover_media_id ? signedMediaUrl(s, viewer, row.cover_media_id) : null };
      if (can('interests')) {
        out.interests = (await c.db.query<any>("SELECT key, label, category FROM user_tags WHERE user_id = $1 AND kind = 'interest' ORDER BY created_at, key", [u.id])).map((r) => ({ key: r.key, label: r.label, category: r.category ?? null }));
      }
      if (can('connections')) {
        const n = async (sql: string) => Number((await c.db.get<{ n: number }>(sql, [u.id]))?.n ?? 0);
        out.counts = {
          followers: await n('SELECT COUNT(*) AS n FROM follows WHERE followee_id = $1'),
          following: await n('SELECT COUNT(*) AS n FROM follows WHERE follower_id = $1'),
          connections: await n('SELECT COUNT(*) AS n FROM follows a JOIN follows b ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id WHERE a.follower_id = $1'),
        };
      }
      if (rel.self || audienceAllows(priv.online_status_visibility, rel)) {
        out.online = !!row.last_seen_at && c.now().getTime() - new Date(row.last_seen_at).getTime() < ONLINE_WINDOW_MS;
      }
      if (row.accent) out.accent = row.accent;
      return { profile: out };
    });

    registerEraser('profile', async (db, userId) => {
      const counts: Record<string, number> = {};
      for (const [name, sql] of [['user_tags', 'DELETE FROM user_tags WHERE user_id = $1'], ['profiles', 'DELETE FROM profiles WHERE user_id = $1'], ['user_privacy', 'DELETE FROM user_privacy WHERE user_id = $1'], ['user_settings', 'DELETE FROM user_settings WHERE user_id = $1']] as const) {
        counts[name] = (await db.run(sql, [userId])).changes;
      }
      return { counts };
    });
    registerExporter('profile', async (db, userId) => {
      const p = await db.get<any>('SELECT headline, bio, pronouns, gender, gender_self_description, avatar_mode, avatar_config, cover_mode, cover_preset, accent FROM profiles WHERE user_id = $1', [userId]);
      const u = await db.get<any>('SELECT handle, display_name, birth_month, birth_year, age_check_method, age_check_status, created_at FROM users WHERE id = $1', [userId]);
      const pr = await db.get<any>('SELECT * FROM user_privacy WHERE user_id = $1', [userId]);
      const st = await db.get<any>('SELECT notifications, messaging, accessibility, nova FROM user_settings WHERE user_id = $1', [userId]);
      return { account: u, profile: p ? { ...p, avatar_config: json(p.avatar_config, {}) } : null, privacy: pr ? { ...pr, field_visibility: json(pr.field_visibility, {}) } : null,
        settings: st ? { notifications: json(st.notifications, {}), messaging: json(st.messaging, {}), accessibility: json(st.accessibility, {}), nova: json(st.nova, {}) } : null, tags: await loadTags(db, userId) };
    });
  },
};
void placeholders;
