import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest } from '../http/errors';
import { AUDIENCES, type Audience } from '../../shared/constants';
import { FIELD_AUDIENCES, FIELD_LABEL, PROFILE_FIELDS, fieldAudience, presetSettings, type PrivacySettings, type ProfileField } from '../../shared/privacy';
import { DEFAULT_SETTINGS, mergeSettings, type PrivacyView, type Settings } from '../../shared/api/settings';
import { loadPrivacy, loadSettings } from '../profile/common';
import { audit } from '../services/audit';
import type { Db } from '../db';

const aud = z.enum(AUDIENCES);
const fieldVis = z.object(Object.fromEntries(PROFILE_FIELDS.map((f) => [f, aud.optional()]))).strict().superRefine((v, ctx) => {
  for (const f of PROFILE_FIELDS) {
    const val = (v as Record<string, Audience | undefined>)[f];
    if (val && !FIELD_AUDIENCES[f].includes(val)) ctx.addIssue({ code: 'custom', path: [f], message: `${FIELD_LABEL[f]} cannot be shared with “${val}”.` });
  }
});

const privacyPatch = z.object({
  profile_visibility: aud.optional(),
  discoverable: z.boolean().optional(),
  who_can_message: z.enum(['members', 'connections', 'nobody']).optional(),
  who_can_mention: z.enum(['members', 'connections', 'nobody']).optional(),
  online_status_visibility: z.enum(['members', 'connections', 'only_me']).optional(),
  default_post_visibility: aud.optional(),
  comments_on_profile: z.boolean().optional(),
  field_visibility: fieldVis.optional(),
}).strict();

const settingsPatch = z.object({
  notifications: z.object(Object.fromEntries(Object.keys(DEFAULT_SETTINGS.notifications).map((k) => [k, z.boolean().optional()]))).strict().optional(),
  messaging: z.object({ readReceipts: z.boolean().optional(), allowMessageRequests: z.boolean().optional() }).strict().optional(),
  accessibility: z.object({ textSize: z.enum(['sm', 'md', 'lg', 'xl']).optional(), reduceMotion: z.boolean().optional(), decorativeMotion: z.enum(['full', 'reduced', 'off']).optional(), highContrast: z.boolean().optional(), calmBackground: z.boolean().optional(), underlineLinks: z.boolean().optional() }).strict().optional(),
  nova: z.object({ journalEnabled: z.boolean().optional(), goalsEnabled: z.boolean().optional(), habitsEnabled: z.boolean().optional(), historyRetentionDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).optional(), saveHistory: z.boolean().optional() }).strict().optional(),
}).strict();

const aLabel = (a: string) => ({ everyone: 'anyone on FREEVERSE (today that means signed-in members)', members: 'any signed-in member', connections: 'only people you follow who follow you back', only_me: 'only you', nobody: 'nobody' } as Record<string, string>)[a] ?? a;

export function effects(p: PrivacySettings): Record<string, string> {
  const e: Record<string, string> = {
    profile_visibility: `Who can open your profile page: ${aLabel(p.profile_visibility)}. Everyone else sees only your name and handle.`,
    discoverable: p.discoverable ? 'You appear in member search and suggestions.' : 'You are hidden from member search and suggestions. People with your handle can still find you unless they are blocked.',
    who_can_message: p.who_can_message === 'nobody' ? 'Nobody can start a conversation with you.' : `Who can message you: ${aLabel(p.who_can_message)}. Other people’s first message may arrive as a request.`,
    who_can_mention: p.who_can_mention === 'nobody' ? 'Nobody can tag you.' : `Who can tag you with @${'handle'}: ${aLabel(p.who_can_mention)}.`,
    online_status_visibility: `Who sees when you are online: ${aLabel(p.online_status_visibility)}.`,
    default_post_visibility: `New posts start out visible to ${aLabel(p.default_post_visibility)}. You can change this per post.`,
    comments_on_profile: p.comments_on_profile ? 'Your non-anonymous comments can be listed on your profile. Anonymous comments never are.' : 'Your comments are not listed on your profile. Anonymous comments never are.',
  };
  for (const f of PROFILE_FIELDS) e[`field:${f}`] = `${FIELD_LABEL[f]}: visible to ${aLabel(fieldAudience(p, f))}, and only to people who can open your profile.`;
  return e;
}

const view = (p: PrivacySettings): PrivacyView => ({ ...p, effects: effects(p), fieldAudiences: FIELD_AUDIENCES });

async function savePrivacy(db: Db, userId: string, p: PrivacySettings, now: string) {
  const r = await db.run(
    `UPDATE user_privacy SET preset = $2, profile_visibility = $3, discoverable = $4, who_can_message = $5, who_can_mention = $6, online_status_visibility = $7,
       default_post_visibility = $8, comments_on_profile = $9, field_visibility = $10, updated_at = $11 WHERE user_id = $1`,
    [userId, p.preset, p.profile_visibility, p.discoverable, p.who_can_message, p.who_can_mention, p.online_status_visibility, p.default_post_visibility, p.comments_on_profile, p.field_visibility, now]);
  if (!r.changes) await db.run(
    `INSERT INTO user_privacy (user_id, preset, profile_visibility, discoverable, who_can_message, who_can_mention, online_status_visibility, default_post_visibility, comments_on_profile, field_visibility, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [userId, p.preset, p.profile_visibility, p.discoverable, p.who_can_message, p.who_can_mention, p.online_status_visibility, p.default_post_visibility, p.comments_on_profile, p.field_visibility, now]);
}

export const privacyModule: ModuleDef = {
  name: 'privacy',
  register(router) {
    router.get('/api/privacy', { auth: 'active' }, async (c) => ({ privacy: view(await loadPrivacy(c.db, c.me.userId)) }));

    router.patch('/api/privacy', { auth: 'active', body: privacyPatch, rate: { key: 'privacy:patch', limit: 60, windowMs: 10 * 60_000 } }, async (c) => {
      const b = c.body as z.infer<typeof privacyPatch>;
      const cur = await loadPrivacy(c.db, c.me.userId);
      const next: PrivacySettings = { ...cur, ...Object.fromEntries(Object.entries(b).filter(([k, v]) => v !== undefined && k !== 'field_visibility')) as Partial<PrivacySettings>, preset: 'custom',
        field_visibility: { ...cur.field_visibility, ...((b.field_visibility ?? {}) as PrivacySettings['field_visibility']) } };
      if (!Object.keys(b).length) throw badRequest('Nothing to change.');
      await savePrivacy(c.db, c.me.userId, next, c.now().toISOString());
      await audit(c.db, { actorId: c.me.userId, action: 'privacy.updated', targetType: 'user', targetId: c.me.userId, meta: { keys: Object.keys(b) } }, c.now());
      return { privacy: view(await loadPrivacy(c.db, c.me.userId)) };
    });

    router.post('/api/privacy/preset', { auth: 'active', body: z.object({ preset: z.enum(['open', 'balanced', 'private']) }).strict() }, async (c) => {
      const b = c.body as { preset: 'open' | 'balanced' | 'private' };
      await savePrivacy(c.db, c.me.userId, presetSettings(b.preset), c.now().toISOString());
      await audit(c.db, { actorId: c.me.userId, action: 'privacy.preset_applied', targetType: 'user', targetId: c.me.userId, meta: { preset: b.preset } }, c.now());
      return { privacy: view(await loadPrivacy(c.db, c.me.userId)) };
    });

    router.get('/api/settings', { auth: 'active' }, async (c) => ({ settings: await loadSettings(c.db, c.me.userId) }));

    router.patch('/api/settings', { auth: 'active', body: settingsPatch }, async (c) => {
      const b = c.body as z.infer<typeof settingsPatch>;
      const cur = await loadSettings(c.db, c.me.userId);
      const next: Settings = mergeSettings({
        notifications: { ...cur.notifications, ...(b.notifications ?? {}) }, messaging: { ...cur.messaging, ...(b.messaging ?? {}) },
        accessibility: { ...cur.accessibility, ...(b.accessibility ?? {}) }, nova: { ...cur.nova, ...(b.nova ?? {}) },
      });
      const now = c.now().toISOString();
      const r = await c.db.run('UPDATE user_settings SET notifications = $2, messaging = $3, accessibility = $4, nova = $5, updated_at = $6 WHERE user_id = $1', [c.me.userId, next.notifications, next.messaging, next.accessibility, next.nova, now]);
      if (!r.changes) await c.db.run('INSERT INTO user_settings (user_id, notifications, messaging, accessibility, nova, updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [c.me.userId, next.notifications, next.messaging, next.accessibility, next.nova, now]);
      return { settings: next };
    });
  },
};
