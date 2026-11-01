import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound } from '../http/errors';
import { created } from '../http/router';
import { uuid } from '../db';
import { audit } from '../services/audit';
import { notify } from '../services/notify';
import { contains } from '../db';
import { registerEraser, registerExporter } from '../services/erasure';
import { SUGGESTION_CATEGORIES, SUGGESTION_LIMITS as L, SUGGESTION_STATUSES, groupSimilar, type StaffSuggestionView, type SuggestionView } from '../../shared/suggestions';

const id = z.string().uuid();
const CATS = SUGGESTION_CATEGORIES.map((c) => c[0]) as [string, ...string[]];
const STATS = SUGGESTION_STATUSES.map((s) => s[0]) as [string, ...string[]];
const clean = (t: string) => t.replace(/\s+\n/g, '\n').trim();

const createBody = z.object({
  title: z.string().trim().min(L.titleMin, `Give it a short title (at least ${L.titleMin} characters).`).max(L.titleMax),
  body: z.string().trim().min(L.bodyMin, `Tell us a little more (at least ${L.bodyMin} characters).`).max(L.bodyMax),
  category: z.enum(CATS), area: z.string().trim().max(L.areaMax).optional(), extra: z.string().trim().max(L.extraMax).optional(),
}).strict();
const statusBody = z.object({ status: z.enum(STATS).optional(), publicNote: z.string().trim().max(600).optional(), internalNote: z.string().trim().max(1000).optional(), mergedInto: id.optional() }).strict();

async function updatesFor(db: any, sid: string, staff: boolean) {
  const rows = await db.query('SELECT u.*, a.handle FROM suggestion_updates u LEFT JOIN users a ON a.id = u.actor_id WHERE u.suggestion_id = $1 ORDER BY u.created_at, u.id', [sid]);
  return rows.filter((u: any) => staff || u.status || u.public_note).map((u: any) => ({ id: u.id, status: u.status ?? null, note: u.public_note ?? null, at: u.created_at, ...(staff ? { internalNote: u.internal_note ?? null, by: u.handle ?? null } : {}) }));
}
async function view(db: any, r: any): Promise<SuggestionView> {
  const into = r.merged_into ? await db.get('SELECT id, title FROM suggestions WHERE id = $1', [r.merged_into]) : null;
  return { id: r.id, title: r.title, body: r.body, category: r.category, area: r.area ?? null, extra: r.extra ?? null, status: r.status, mergedInto: into ? { id: into.id, title: into.title } : null, createdAt: r.created_at, updatedAt: r.updated_at, updates: await updatesFor(db, r.id, false) };
}

export const suggestionsModule: ModuleDef = {
  name: 'suggestions',
  register(router, s) {
    // ───────── citizens: private to the author ─────────
    router.post('/api/suggestions', { auth: 'active', body: createBody, rate: { key: 'suggest', limit: L.perDay, windowMs: 24 * 3600_000 } }, async (c) => {
      const b = c.body; const sid = uuid(); const now = c.now().toISOString();
      await c.db.run('INSERT INTO suggestions (id, author_id, title, body, category, area, extra, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
        [sid, c.me.userId, clean(b.title), clean(b.body), b.category, b.area ? clean(b.area) : null, b.extra ? clean(b.extra) : null, 'submitted', now]);
      return created({ suggestion: await view(c.db, await c.db.get('SELECT * FROM suggestions WHERE id = $1', [sid])) });
    });
    router.get('/api/suggestions/mine', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>('SELECT * FROM suggestions WHERE author_id = $1 ORDER BY created_at DESC LIMIT 100', [c.me.userId]);
      return { items: await Promise.all(rows.map((r) => view(c.db, r))), note: 'Suggestions are private. Only you and a small review group can see them. We read them all but cannot promise to build every one.' };
    });
    router.delete('/api/suggestions/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM suggestions WHERE id = $1 AND author_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId]);
      if (!r.changes) throw notFound('We couldn’t find that suggestion.');
      return { ok: true };
    });

    // ───────── review queue: view (limited, no author) or review (full) ─────────
    router.get('/api/founder/suggestions', { auth: { perm: 'suggestions.view' }, query: z.object({ status: z.enum(STATS).optional(), category: z.enum(CATS).optional(), q: z.string().trim().max(60).optional() }) }, async (c) => {
      const full = c.me.permissions.has('suggestions.review');
      const params: unknown[] = []; const w: string[] = []; const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
      if (c.query.status) w.push(`status = ${p(c.query.status)}`); if (c.query.category) w.push(`category = ${p(c.query.category)}`);
      if (c.query.q) { const l = p(contains(c.query.q)); w.push(`(lower(title) LIKE ${l} ESCAPE '\\' OR lower(body) LIKE ${l} ESCAPE '\\')`); }
      const rows = await c.db.query<any>(`SELECT * FROM suggestions ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`, params);
      const counts = await c.db.query<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM suggestions GROUP BY status');
      const names = full ? new Map((await c.db.query<any>('SELECT id, handle FROM users WHERE id IN (SELECT author_id FROM suggestions)')).map((u) => [u.id, u.handle])) : new Map();
      const items = rows.map((r) => ({ id: r.id, title: r.title, body: r.body, category: r.category, area: r.area ?? null, extra: r.extra ?? null, status: r.status, createdAt: r.created_at, author: full && r.author_id ? { handle: names.get(r.author_id) ?? '' } : null }));
      return { items, counts: Object.fromEntries(counts.map((x) => [x.status, Number(x.n)])), canReview: full, possibleDuplicates: groupSimilar(items.filter((i) => !['merged', 'declined', 'completed'].includes(i.status))).map((g) => g.map((i) => ({ id: i.id, title: i.title }))),
        duplicatesNote: 'Possible duplicates are found by shared words only, not by an AI. Check each group before merging.' };
    });
    router.get('/api/founder/suggestions/:id', { auth: { perm: 'suggestions.view' } }, async (c) => {
      const full = c.me.permissions.has('suggestions.review');
      const r = await c.db.get<any>('SELECT * FROM suggestions WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!r) throw notFound('We couldn’t find that suggestion.');
      const handle = full && r.author_id ? (await c.db.get<{ handle: string }>('SELECT handle FROM users WHERE id = $1', [r.author_id]))?.handle : null;
      const v = await view(c.db, r);
      return { suggestion: { ...v, author: handle ? { handle } : null, updates: await updatesFor(c.db, r.id, full) } as StaffSuggestionView, canReview: full };
    });
    router.post('/api/founder/suggestions/:id/update', { auth: { perm: 'suggestions.review' }, body: statusBody }, async (c) => {
      const b = c.body; const sid = id.safeParse(c.params.id).data ?? '';
      const r = await c.db.get<any>('SELECT * FROM suggestions WHERE id = $1', [sid]);
      if (!r) throw notFound('We couldn’t find that suggestion.');
      if (!b.status && !b.publicNote && !b.internalNote) throw conflict('Choose a status or write a note.', 'nothing_to_do');
      if (b.status === 'merged') {
        if (!b.mergedInto || b.mergedInto === sid) throw conflict('Choose a different suggestion to merge this into.', 'merge_target_required');
        const t = await c.db.get<any>('SELECT id, status FROM suggestions WHERE id = $1', [b.mergedInto]);
        if (!t || t.status === 'merged') throw conflict('That suggestion can’t be merged into: it is missing or already merged.', 'merge_target_invalid');
      }
      if (b.status === 'declined' && !b.publicNote) throw conflict('Add a short reason for declining. The person who suggested it will see it.', 'reason_required');
      const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        if (b.status) await t.run('UPDATE suggestions SET status = $2, merged_into = $3, updated_at = $4 WHERE id = $1', [sid, b.status, b.status === 'merged' ? b.mergedInto! : null, now]);
        else await t.run('UPDATE suggestions SET updated_at = $2 WHERE id = $1', [sid, now]);
        await t.run('INSERT INTO suggestion_updates (id, suggestion_id, actor_id, status, public_note, internal_note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuid(), sid, c.me.userId, b.status ?? null, b.publicNote ?? null, b.internalNote ?? null, now]);
      });
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'suggestion.updated', targetType: 'suggestion', targetId: sid, meta: { status: b.status ?? null, from: r.status } }, c.now());
      if ((b.status && b.status !== r.status) || b.publicNote) if (r.author_id) await notify(c.db, { userId: r.author_id, type: 'system', targetType: 'suggestion', targetId: sid, data: { text: `Update on your suggestion “${String(r.title).slice(0, 60)}”${b.status ? `: ${b.status.replace('_', ' ')}` : ''}.` } }, c.now());
      const v = await view(c.db, await c.db.get('SELECT * FROM suggestions WHERE id = $1', [sid]));
      return { suggestion: { ...v, updates: await updatesFor(c.db, sid, true) } };
    });

    registerEraser('suggestions', async (db, userId) => ({ counts: { suggestions: (await db.run('DELETE FROM suggestions WHERE author_id = $1', [userId])).changes } }));
    registerExporter('suggestions', async (db, userId) => db.query('SELECT title, body, category, area, extra, status, created_at FROM suggestions WHERE author_id = $1 ORDER BY created_at', [userId]));
  },
};
