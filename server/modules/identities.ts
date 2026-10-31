import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, notFound } from '../http/errors';
import { created } from '../http/router';
import { bool, json, uuid } from '../db';
import { ARCHETYPES, AUDIENCES } from '../../shared/constants';
import { ARCHETYPE_DEFS, ARCHETYPE_LIST, type EntryKind } from '../../shared/archetypes';
import type { AchievementView, IdentityView, SuggestionView } from '../../shared/api/identity';
import { entryView, evaluate, userStats } from '../identity/stats';
import { canOpenProfile, audienceAllows } from '../policy/visibility';
import { safeUrl } from './posts';
import { registerEraser, registerExporter } from '../services/erasure';
import type { Db } from '../db';

const ENTRY_KINDS = ['project', 'publication', 'achievement', 'credential', 'experience', 'skill', 'showcase', 'contribution', 'mentoring', 'venture', 'research_output', 'game_highlight'] as const;
const aud = z.enum(AUDIENCES);
const answers = z.record(z.string().max(40), z.union([z.string().max(400), z.array(z.string().max(60)).max(12)])).default({});
const MAX_IDENTITIES = 8; const MAX_ENTRIES = 200;

const view = (r: any): IdentityView => ({ id: r.id, archetype: r.archetype, status: r.status, isPrimary: bool(r.is_primary), headline: r.headline ?? null, visibility: r.visibility, answers: json(r.data, {}), createdAt: r.created_at });

/** Keep only answers to real questions, with real option keys. Free text is capped. */
export function cleanAnswers(archetype: (typeof ARCHETYPES)[number], raw: Record<string, string | string[]>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const q of ARCHETYPE_DEFS[archetype].questions) {
    const v = raw[q.id]; if (v === undefined) continue;
    if (q.type === 'text') { if (typeof v === 'string' && v.trim()) out[q.id] = v.trim().slice(0, 300); continue; }
    const keys = new Set((q.options ?? []).map((o) => o.key));
    const arr = (Array.isArray(v) ? v : [v]).filter((x) => keys.has(x)).slice(0, q.max ?? 12);
    if (q.type === 'single') { if (arr[0]) out[q.id] = arr[0]; } else if (arr.length) out[q.id] = arr;
  }
  return out;
}

export async function myIdentities(db: Db, userId: string, includeRemoved = false): Promise<IdentityView[]> {
  return (await db.query<any>(`SELECT * FROM user_identities WHERE user_id = $1 ${includeRemoved ? '' : "AND status <> 'removed'"} ORDER BY is_primary DESC, created_at`, [userId])).map(view);
}
export async function addIdentity(db: Db, userId: string, archetype: (typeof ARCHETYPES)[number], now: Date, input: { headline?: string | null; answers?: Record<string, string | string[]>; makePrimary?: boolean } = {}): Promise<IdentityView> {
  const live = await db.query<any>("SELECT id, archetype FROM user_identities WHERE user_id = $1 AND status <> 'removed'", [userId]);
  if (live.some((r) => r.archetype === archetype)) throw conflict('You already have that identity.', 'identity_exists');
  if (live.length >= MAX_IDENTITIES) throw conflict(`You can hold up to ${MAX_IDENTITIES} identities. Remove one to add another.`, 'quota_exceeded');
  const id = uuid(); const primary = input.makePrimary || live.length === 0;
  await db.tx(async (t) => {
    if (primary) await t.run('UPDATE user_identities SET is_primary = $2 WHERE user_id = $1', [userId, false]);
    await t.run('INSERT INTO user_identities (id, user_id, archetype, status, is_primary, headline, data, visibility, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
      [id, userId, archetype, 'active', primary, input.headline?.slice(0, 120) ?? null, JSON.stringify(cleanAnswers(archetype, input.answers ?? {})), ARCHETYPE_DEFS[archetype].defaultVisibility, now.toISOString()]);
  });
  return view(await db.get('SELECT * FROM user_identities WHERE id = $1', [id]));
}

export const identitiesModule: ModuleDef = {
  name: 'identities',
  register(router, s) {
    router.get('/api/archetypes', { auth: 'active' }, async () => ({ items: ARCHETYPE_LIST.map((a) => ({ id: a.id, label: a.label, icon: a.icon, accent: a.accent, tagline: a.tagline, blurb: a.blurb, vocab: a.vocab, questions: a.questions, tools: a.tools, suggestTags: a.suggestTags })) }));

    router.get('/api/identities', { auth: 'active' }, async (c) => ({ items: await myIdentities(c.db, c.me.userId, true) }));
    router.post('/api/identities', { auth: 'active', body: z.object({ archetype: z.enum(ARCHETYPES), headline: z.string().trim().max(120).nullable().optional(), answers, primary: z.boolean().optional() }).strict(), rate: { key: 'identity:add', limit: 30, windowMs: 3600_000 } }, async (c) => {
      // A removed identity can come back: it is reactivated rather than duplicated, with its old answers kept.
      const old = await c.db.get<any>("SELECT id FROM user_identities WHERE user_id = $1 AND archetype = $2 AND status = 'removed'", [c.me.userId, c.body.archetype]);
      if (old) await c.db.run('DELETE FROM user_identities WHERE id = $1', [old.id]);
      const i = await addIdentity(c.db, c.me.userId, c.body.archetype, c.now(), { headline: c.body.headline, answers: c.body.answers, makePrimary: c.body.primary });
      return created({ identity: i });
    });
    router.patch('/api/identities/:id', { auth: 'active', body: z.object({ status: z.enum(['active', 'paused']).optional(), headline: z.string().trim().max(120).nullable().optional(), visibility: aud.optional(), answers: answers.optional(), primary: z.literal(true).optional() }).strict() }, async (c) => {
      const r = await c.db.get<any>("SELECT * FROM user_identities WHERE id = $1 AND user_id = $2 AND status <> 'removed'", [c.params.id, c.me.userId]);
      if (!r) throw notFound('We couldn’t find that identity.');
      const sets: string[] = []; const p: unknown[] = [r.id]; const add = (col: string, v: unknown) => { p.push(v); sets.push(`${col} = $${p.length}`); };
      if (c.body.status) { if (c.body.status === 'paused' && bool(r.is_primary) && c.body.primary !== true) { const other = await c.db.get("SELECT 1 AS x FROM user_identities WHERE user_id = $1 AND status = 'active' AND id <> $2", [c.me.userId, r.id]); if (!other) throw conflict('Keep at least one active identity, or remove this one.', 'last_identity'); } add('status', c.body.status); }
      if (c.body.headline !== undefined) add('headline', c.body.headline);
      if (c.body.visibility) add('visibility', c.body.visibility);
      if (c.body.answers) add('data', JSON.stringify({ ...json<Record<string, unknown>>(r.data, {}), ...cleanAnswers(r.archetype, c.body.answers) }));
      add('updated_at', c.now().toISOString());
      await c.db.tx(async (t) => {
        if (c.body.primary) { await t.run('UPDATE user_identities SET is_primary = $2 WHERE user_id = $1', [c.me.userId, false]); sets.push('is_primary = ' + (s.db.dialect === 'postgres' ? 'TRUE' : '1')); }
        await t.run(`UPDATE user_identities SET ${sets.join(', ')} WHERE id = $1`, p);
      });
      return { identity: view(await c.db.get('SELECT * FROM user_identities WHERE id = $1', [r.id])) };
    });
    // Removing an identity never deletes the account, and never deletes what you made: your entries stay on your profile.
    router.delete('/api/identities/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.get<any>("SELECT * FROM user_identities WHERE id = $1 AND user_id = $2 AND status <> 'removed'", [c.params.id, c.me.userId]);
      if (!r) throw notFound('We couldn’t find that identity.');
      await c.db.tx(async (t) => {
        await t.run("UPDATE user_identities SET status = 'removed', is_primary = $3, removed_at = $2, updated_at = $2 WHERE id = $1", [r.id, c.now().toISOString(), false]);
        await t.run('UPDATE profile_entries SET identity_id = NULL WHERE identity_id = $1', [r.id]);
        if (bool(r.is_primary)) {
          const next = await t.get<any>("SELECT id FROM user_identities WHERE user_id = $1 AND status = 'active' ORDER BY created_at LIMIT 1", [c.me.userId]);
          if (next) await t.run('UPDATE user_identities SET is_primary = $2 WHERE id = $1', [next.id, true]);
        }
      });
      return { ok: true, note: 'Identity removed. Your account and everything you made are unchanged.' };
    });

    // ───────── profile entries (living profile) ─────────
    const entryBody = z.object({ kind: z.enum(ENTRY_KINDS), title: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).nullable().optional(), link: z.string().trim().max(500).nullable().optional(), mediaId: z.string().uuid().nullable().optional(), occurredOn: z.string().regex(/^\d{4}(-\d{2}){0,2}$/).nullable().optional(), visibility: aud.optional(), pinned: z.boolean().optional(), identityId: z.string().uuid().nullable().optional() }).strict();
    async function checkRefs(db: Db, userId: string, b: { link?: string | null; mediaId?: string | null; identityId?: string | null }) {
      if (b.link && !safeUrl(b.link)) throw badRequest('Use a full web link starting with https://', { link: 'invalid' }, 'invalid_link');
      if (b.mediaId && !(await db.get('SELECT 1 AS x FROM media WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL', [b.mediaId, userId]))) throw badRequest('That image is not yours or no longer exists.', { mediaId: 'invalid' }, 'invalid_media');
      if (b.identityId && !(await db.get("SELECT 1 AS x FROM user_identities WHERE id = $1 AND user_id = $2 AND status <> 'removed'", [b.identityId, userId]))) throw badRequest('That identity does not exist.', { identityId: 'invalid' }, 'invalid_identity');
    }
    router.get('/api/me/entries', { auth: 'active', query: z.object({ kind: z.enum(ENTRY_KINDS).optional() }) }, async (c) => {
      const rows = await c.db.query<any>(`SELECT * FROM profile_entries WHERE user_id = $1 ${c.query.kind ? 'AND kind = $2' : ''} ORDER BY pinned DESC, created_at DESC`, c.query.kind ? [c.me.userId, c.query.kind] : [c.me.userId]);
      return { items: rows.map((r) => entryView(s, c.me.userId, r)) };
    });
    router.post('/api/me/entries', { auth: 'active', body: entryBody, rate: { key: 'entries', limit: 60, windowMs: 3600_000 } }, async (c) => {
      await checkRefs(c.db, c.me.userId, c.body);
      if (Number((await c.db.get<any>('SELECT COUNT(*) AS n FROM profile_entries WHERE user_id = $1', [c.me.userId]))?.n) >= MAX_ENTRIES) throw conflict('You have reached the profile entries limit.', 'quota_exceeded');
      const id = uuid(); const now = c.now().toISOString();
      // Always self-declared: a person cannot mark their own claim as verified or platform-recorded.
      await c.db.run('INSERT INTO profile_entries (id, user_id, identity_id, kind, title, description, link, media_id, data, occurred_on, evidence_type, visibility, pinned, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)',
        [id, c.me.userId, c.body.identityId ?? null, c.body.kind, c.body.title, c.body.description ?? null, c.body.link ? safeUrl(c.body.link) : null, c.body.mediaId ?? null, '{}', c.body.occurredOn ?? null, 'self_declared', c.body.visibility ?? 'members', c.body.pinned ?? false, now]);
      return created({ item: entryView(s, c.me.userId, await c.db.get('SELECT * FROM profile_entries WHERE id = $1', [id])) });
    });
    router.patch('/api/me/entries/:id', { auth: 'active', body: entryBody.partial() }, async (c) => {
      const r = await c.db.get<any>('SELECT * FROM profile_entries WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!r) throw notFound('We couldn’t find that entry.');
      await checkRefs(c.db, c.me.userId, c.body);
      const map: Record<string, string> = { kind: 'kind', title: 'title', description: 'description', link: 'link', mediaId: 'media_id', occurredOn: 'occurred_on', visibility: 'visibility', pinned: 'pinned', identityId: 'identity_id' };
      const sets: string[] = []; const p: unknown[] = [r.id];
      for (const [k, col] of Object.entries(map)) if ((c.body as any)[k] !== undefined) { p.push(k === 'link' && (c.body as any)[k] ? safeUrl((c.body as any)[k]) : (c.body as any)[k]); sets.push(`${col} = $${p.length}`); }
      // Editing the substance of a platform-recorded or verified entry makes it a self-declared claim again.
      if (r.evidence_type !== 'self_declared' && (c.body.title !== undefined || c.body.description !== undefined || c.body.occurredOn !== undefined)) { p.push('self_declared'); sets.push(`evidence_type = $${p.length}`); }
      p.push(c.now().toISOString()); sets.push(`updated_at = $${p.length}`);
      await c.db.run(`UPDATE profile_entries SET ${sets.join(', ')} WHERE id = $1`, p);
      return { item: entryView(s, c.me.userId, await c.db.get('SELECT * FROM profile_entries WHERE id = $1', [r.id])) };
    });
    router.delete('/api/me/entries/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM profile_entries WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound('We couldn’t find that entry.');
      return { ok: true };
    });

    // What another member may see of someone's identities and entries: the same audience rules as every other field.
    router.get('/api/members/:handle/living', { auth: 'active' }, async (c) => {
      const u = await c.db.get<any>("SELECT id FROM users WHERE handle = $1 AND status = 'active'", [String(c.params.handle).toLowerCase()]);
      if (!u) throw notFound('We couldn’t find that member.');
      const gate = await canOpenProfile(c.db, c.me.userId, u.id);
      if (!gate.owner || gate.rel.blocked || !gate.ok) throw notFound('We couldn’t find that member.');
      const ids = (await c.db.query<any>("SELECT * FROM user_identities WHERE user_id = $1 AND status = 'active' ORDER BY is_primary DESC, created_at", [u.id])).filter((r) => audienceAllows(r.visibility, gate.rel));
      const entries = (await c.db.query<any>('SELECT * FROM profile_entries WHERE user_id = $1 ORDER BY pinned DESC, created_at DESC', [u.id])).filter((r) => audienceAllows(r.visibility, gate.rel));
      // Answers to onboarding questions are private to the owner; only the identity, its headline and its entries are shown.
      return { identities: ids.map((r) => ({ id: r.id, archetype: r.archetype, label: ARCHETYPE_DEFS[r.archetype as keyof typeof ARCHETYPE_DEFS]?.label ?? r.archetype, icon: ARCHETYPE_DEFS[r.archetype as keyof typeof ARCHETYPE_DEFS]?.icon ?? '', headline: r.headline ?? null, isPrimary: bool(r.is_primary) })), entries: entries.map((r) => entryView(s, c.me.userId, r)).map((e) => ({ ...e, identityId: null })) };
    });

    // ───────── evidence-based suggestions ─────────
    // Built only from records the platform itself holds (completed Learn items, event RSVPs, your own creative posts).
    // Journals, goals, conversations and messages are never read. Nothing is applied until the person accepts it.
    router.post('/api/me/suggestions/refresh', { auth: 'active', rate: { key: 'suggestions', limit: 20, windowMs: 3600_000 } }, async (c) => {
      const now = c.now().toISOString(); let added = 0;
      const put = async (kind: EntryKind, draft: object, reason: string, ref: string) => {
        if (await c.db.get('SELECT 1 AS x FROM profile_suggestions WHERE user_id = $1 AND evidence_ref = $2 AND kind = $3', [c.me.userId, ref, kind])) return;
        if (await c.db.get('SELECT 1 AS x FROM profile_entries WHERE user_id = $1 AND evidence_ref = $2', [c.me.userId, ref])) return;
        await c.db.run('INSERT INTO profile_suggestions (id, user_id, kind, draft, reason, evidence_ref, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [uuid(), c.me.userId, kind, JSON.stringify(draft), reason, ref, 'pending', now]); added++;
      };
      for (const r of await c.db.query<any>("SELECT l.id, l.title, l.format, p.completed_at FROM learn_progress p JOIN learn_items l ON l.id = p.item_id WHERE p.user_id = $1 AND p.status = 'completed' AND l.format IN ('course','path','quiz','challenge','project') LIMIT 20", [c.me.userId]))
        await put('achievement', { title: `Completed: ${r.title}`, occurredOn: String(r.completed_at ?? now).slice(0, 10) }, `You completed this ${r.format} in Learn.`, `learn:${r.id}`);
      for (const r of await c.db.query<any>("SELECT e.id, e.title, e.starts_at FROM event_rsvps v JOIN events e ON e.id = v.event_id WHERE v.user_id = $1 AND v.response = 'yes' AND e.category = 'Volunteering' AND e.starts_at < $2 LIMIT 10", [c.me.userId, now]))
        await put('contribution', { title: `Volunteered: ${r.title}`, occurredOn: String(r.starts_at).slice(0, 10) }, 'You RSVP’d yes to this volunteering event.', `event:${r.id}`);
      for (const r of await c.db.query<any>("SELECT id, title, body FROM posts WHERE author_id = $1 AND is_anonymous = $2 AND kind = 'creative' AND status = 'published' ORDER BY created_at DESC LIMIT 5", [c.me.userId, false]))
        await put('showcase', { title: r.title || String(r.body).slice(0, 60) || 'A creative post', description: 'From your creative post.' }, 'You shared this as a creative post (not anonymous).', `post:${r.id}`);
      return { added };
    });
    router.get('/api/me/suggestions', { auth: 'active' }, async (c) => ({ items: (await c.db.query<any>("SELECT * FROM profile_suggestions WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC", [c.me.userId])).map((r): SuggestionView => ({ id: r.id, kind: r.kind, draft: json(r.draft, { title: '' }), reason: r.reason, evidenceRef: r.evidence_ref, createdAt: r.created_at })) }));
    router.post('/api/me/suggestions/:id/accept', { auth: 'active', body: z.object({ visibility: aud.optional() }).strict() }, async (c) => {
      const r = await c.db.get<any>("SELECT * FROM profile_suggestions WHERE id = $1 AND user_id = $2 AND status = 'pending'", [c.params.id, c.me.userId]);
      if (!r) throw notFound('That suggestion is no longer available.');
      const d = json<any>(r.draft, {}); const id = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        // Default audience is “Only me”: accepting never publishes anything on its own.
        await t.run('INSERT INTO profile_entries (id, user_id, kind, title, description, data, occurred_on, evidence_type, evidence_ref, visibility, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)', [id, c.me.userId, r.kind, String(d.title).slice(0, 120), d.description ?? null, '{}', d.occurredOn ?? null, 'platform_recorded', r.evidence_ref, c.body.visibility ?? 'only_me', now]);
        await t.run("UPDATE profile_suggestions SET status = 'accepted', decided_at = $2 WHERE id = $1", [r.id, now]);
      });
      return created({ item: entryView(s, c.me.userId, await c.db.get('SELECT * FROM profile_entries WHERE id = $1', [id])) });
    });
    router.post('/api/me/suggestions/:id/dismiss', { auth: 'active' }, async (c) => {
      const r = await c.db.run("UPDATE profile_suggestions SET status = 'dismissed', decided_at = $3 WHERE id = $1 AND user_id = $2 AND status = 'pending'", [c.params.id, c.me.userId, c.now().toISOString()]);
      if (!r.changes) throw notFound('That suggestion is no longer available.');
      return { ok: true };
    });

    router.get('/api/me/achievements', { auth: 'active' }, async (c) => {
      const st = await userStats(c.db, c.me.userId); const out: AchievementView[] = [];
      for (const i of await myIdentities(c.db, c.me.userId)) for (const a of ARCHETYPE_DEFS[i.archetype].achievements) out.push(evaluate(a, st, i.archetype));
      const shown = new Set((await c.db.query<{ achievement_id: string }>('SELECT achievement_id FROM achievement_display WHERE user_id = $1 AND is_public = $2', [c.me.userId, true])).map((r) => r.achievement_id));
      return { items: out.map((a) => ({ ...a, public: shown.has(a.id), evidence: 'platform_recorded' as const })), note: 'Achievements are computed from what you have done on FREEVERSE (recorded by the platform, not verified credentials). They are private unless you choose to show one. Hiding one never deletes the record.' };
    });
    // Show or hide one achievement on your profile. Only earned achievements can be shown.
    router.put('/api/me/achievements/:id/display', { auth: 'active', body: z.object({ public: z.boolean() }).strict() }, async (c) => {
      const st = await userStats(c.db, c.me.userId); let found: AchievementView | null = null;
      for (const i of await myIdentities(c.db, c.me.userId)) for (const a of ARCHETYPE_DEFS[i.archetype].achievements) { const e = evaluate(a, st, i.archetype); if (e.id === c.params.id) found = e; }
      if (!found) throw notFound('We couldn’t find that milestone.');
      if (c.body.public && !found.earned) throw badRequest('Only earned milestones can be shown.', undefined, 'not_earned');
      const now = c.now().toISOString();
      const r = await c.db.run('UPDATE achievement_display SET is_public = $3, updated_at = $4 WHERE user_id = $1 AND achievement_id = $2', [c.me.userId, found.id, c.body.public, now]);
      if (!r.changes) await c.db.run('INSERT INTO achievement_display (user_id, achievement_id, is_public, updated_at) VALUES ($1,$2,$3,$4)', [c.me.userId, found.id, c.body.public, now]);
      return { ok: true, public: c.body.public };
    });

    registerEraser('identities', async (db, userId) => {
      await db.run('DELETE FROM achievement_display WHERE user_id = $1', [userId]);
      await db.run('DELETE FROM profile_suggestions WHERE user_id = $1', [userId]);
      const e = await db.run('DELETE FROM profile_entries WHERE user_id = $1', [userId]);
      const i = await db.run('DELETE FROM user_identities WHERE user_id = $1', [userId]);
      return { counts: { profile_entries: e.changes, user_identities: i.changes } };
    });
    registerExporter('identities', async (db, userId) => ({
      identities: await db.query('SELECT archetype, status, is_primary, headline, data, visibility, created_at FROM user_identities WHERE user_id = $1', [userId]),
      entries: await db.query('SELECT kind, title, description, link, occurred_on, evidence_type, visibility, created_at FROM profile_entries WHERE user_id = $1', [userId]),
    }));
  },
};
