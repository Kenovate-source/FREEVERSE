import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, notFound } from '../http/errors';
import { created } from '../http/router';
import { bool, uuid } from '../db';
import { AUDIENCES } from '../../shared/constants';
import { LABEL_CATALOG, LABEL_CATEGORIES, LABEL_LIMITS as L, LABEL_STAGES, labelByKey, screenIdentityClaim } from '../../shared/identity-labels';
import { slugify } from '../../shared/interests';
import { screenLabel } from '../../shared/label-screen';
import { canOpenProfile, audienceAllows } from '../policy/visibility';
import { registerEraser, registerExporter } from '../services/erasure';

const aud = z.enum(AUDIENCES);
const stage = z.enum(LABEL_STAGES);
const id = z.string().uuid();
const view = (r: any) => ({ id: r.id, key: r.key, label: r.label, category: r.category ?? null, isCustom: bool(r.is_custom), stage: r.stage, note: r.note ?? null, visibility: r.visibility, createdAt: r.created_at, updatedAt: r.updated_at });
const noteField = z.string().trim().max(L.noteMax).nullable().optional();

function checkText(label: string, note?: string | null) {
  for (const t of [label, note ?? '']) { if (!t) continue; const bad = screenLabel(t); if (bad) throw badRequest(bad, { label: 'label_not_allowed' }, 'label_not_allowed'); }
  const claim = screenIdentityClaim(label); if (claim) throw badRequest(claim, { label: 'label_claims_authority' }, 'label_claims_authority');
}

export const identityLabelsModule: ModuleDef = {
  name: 'identity-labels',
  register(router) {
    registerEraser('identity_labels', async (db, userId) => ({ counts: { identity_labels: (await db.run('DELETE FROM identity_labels WHERE user_id = $1', [userId])).changes } }));
    registerExporter('identity_labels', async (db, userId) => db.query('SELECT label, category, is_custom, stage, note, visibility, created_at FROM identity_labels WHERE user_id = $1', [userId]));

    router.get('/api/catalog/identity-labels', { auth: 'active' }, async () => ({ categories: LABEL_CATEGORIES, items: LABEL_CATALOG, limits: L, note: 'A starting vocabulary, not a complete list. You can always describe yourself in your own words.' }));
    router.get('/api/me/identity-labels', { auth: 'active' }, async (c) => ({ items: (await c.db.query<any>('SELECT * FROM identity_labels WHERE user_id = $1 ORDER BY created_at', [c.me.userId])).map(view) }));

    router.post('/api/me/identity-labels', {
      auth: 'active', rate: { key: 'idlabel:add', limit: 60, windowMs: 3600_000 },
      body: z.object({ key: z.string().max(60).optional(), custom: z.string().trim().min(L.labelMin).max(L.labelMax).optional(), stage: stage.default('current'), note: noteField, visibility: aud.default('members') }).strict()
        .refine((b) => !!b.key !== !!b.custom, { message: 'Choose a label from the list, or write your own, not both.' }),
    }, async (c) => {
      const b = c.body; let key: string; let label: string; let category: string | null = null; let custom = false;
      if (b.key) { const it = labelByKey(b.key); if (!it) throw notFound('That label isn’t in the list.'); key = it.key; label = it.label; category = it.category; }
      else {
        label = b.custom!.replace(/\s+/g, ' '); custom = true; key = `custom:${slugify(label)}`;
        if (key === 'custom:') throw badRequest('Please use letters or numbers.', { custom: 'invalid' }, 'invalid_label');
        const std = LABEL_CATALOG.find((x) => x.label.toLowerCase() === label.toLowerCase()); if (std) { key = std.key; label = std.label; category = std.category; custom = false; }
      }
      checkText(label, b.note);
      const n = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_labels WHERE user_id = $1', [c.me.userId]);
      if (Number(n?.n ?? 0) >= L.max) throw conflict(`You can keep up to ${L.max} labels. Remove one to add another.`, 'quota_exceeded');
      if (await c.db.get('SELECT 1 AS x FROM identity_labels WHERE user_id = $1 AND key = $2', [c.me.userId, key])) throw conflict('You already have that label.', 'label_exists');
      const lid = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        await t.run('INSERT INTO identity_labels (id, user_id, key, label, category, is_custom, stage, note, visibility, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)', [lid, c.me.userId, key, label, category, custom, b.stage, b.note?.trim() || null, b.visibility, now]);
        await t.run('INSERT INTO identity_label_events (id, label_id, user_id, from_stage, to_stage, occurred_at) VALUES ($1,$2,$3,NULL,$4,$5)', [uuid(), lid, c.me.userId, b.stage, now]);
      });
      return created({ label: view(await c.db.get('SELECT * FROM identity_labels WHERE id = $1', [lid])) });
    });

    router.patch('/api/me/identity-labels/:id', { auth: 'active', body: z.object({ stage: stage.optional(), note: noteField, visibility: aud.optional(), label: z.string().trim().min(L.labelMin).max(L.labelMax).optional() }).strict() }, async (c) => {
      const r = await c.db.get<any>('SELECT * FROM identity_labels WHERE id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId]); if (!r) throw notFound('We couldn’t find that label.');
      const b = c.body; const now = c.now().toISOString();
      if (b.label !== undefined && !bool(r.is_custom)) throw badRequest('Only your own wording can be edited. Remove this label and add another instead.', { label: 'not_custom' }, 'not_custom');
      const label = b.label !== undefined ? b.label.replace(/\s+/g, ' ') : r.label; const note = b.note !== undefined ? (b.note?.trim() || null) : r.note;
      if (b.label !== undefined || b.note !== undefined) checkText(label, note);
      await c.db.tx(async (t) => {
        await t.run('UPDATE identity_labels SET label = $2, note = $3, stage = $4, visibility = $5, updated_at = $6 WHERE id = $1', [r.id, label, note, b.stage ?? r.stage, b.visibility ?? r.visibility, now]);
        if (b.stage && b.stage !== r.stage) await t.run('INSERT INTO identity_label_events (id, label_id, user_id, from_stage, to_stage, occurred_at) VALUES ($1,$2,$3,$4,$5,$6)', [uuid(), r.id, c.me.userId, r.stage, b.stage, now]);
      });
      return { label: view(await c.db.get('SELECT * FROM identity_labels WHERE id = $1', [r.id])) };
    });
    router.get('/api/me/identity-labels/:id/history', { auth: 'active' }, async (c) => {
      const r = await c.db.get<any>('SELECT id FROM identity_labels WHERE id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId]); if (!r) throw notFound('We couldn’t find that label.');
      return { items: (await c.db.query<any>('SELECT from_stage, to_stage, occurred_at FROM identity_label_events WHERE label_id = $1 ORDER BY occurred_at, CASE WHEN from_stage IS NULL THEN 0 ELSE 1 END, id', [r.id])).map((e) => ({ from: e.from_stage ?? null, to: e.to_stage, at: e.occurred_at })) };
    });
    router.delete('/api/me/identity-labels/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM identity_labels WHERE id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId]); if (!r.changes) throw notFound('We couldn’t find that label.');
      return { ok: true };
    });

    // What another member may see: only labels whose audience includes the viewer, and only if the viewer may open the profile at all.
    router.get('/api/members/:handle/identity-labels', { auth: 'active' }, async (c) => {
      const u = await c.db.get<any>("SELECT id FROM users WHERE handle = $1 AND status = 'active'", [String(c.params.handle).toLowerCase()]); if (!u) throw notFound('We couldn’t find that member.');
      const gate = await canOpenProfile(c.db, c.me.userId, u.id);
      if (!gate.owner || gate.rel.blocked || !gate.ok) throw notFound('We couldn’t find that member.');
      const rows = (await c.db.query<any>('SELECT * FROM identity_labels WHERE user_id = $1 ORDER BY created_at', [u.id])).filter((r) => audienceAllows(r.visibility, gate.rel));
      return { items: rows.map((r) => ({ id: r.id, label: r.label, stage: r.stage, note: r.note ?? null, isCustom: bool(r.is_custom) })) };
    });
  },
};
