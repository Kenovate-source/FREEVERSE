import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound } from '../http/errors';
import { created } from '../http/router';
import { bool, uuid } from '../db';
import { registerEraser, registerExporter } from '../services/erasure';
import { likeTerm, savedSet, tagsOf } from '../catalog/common';
import { OPP_TYPES, TRACK_STATUSES, type MentorCard, type OpportunityCard } from '../../shared/api/catalog';

const NOTICE = 'Demo listings: these entries are illustrative. No organisation here is real and nothing can be applied for through FREEVERSE yet. Use the tracker to keep your own notes.';
const oppCard = (r: any, saved: Set<string>, tr: Map<string, string>): OpportunityCard => ({ id: r.id, type: r.type, title: r.title, organisation: r.organisation, description: r.description, category: r.category, workMode: r.work_mode, location: r.location ?? null, deadline: r.deadline ?? null, applyUrl: r.apply_url ?? null, tags: tagsOf(r.tags), isDemo: bool(r.is_demo), saved: saved.has(r.id), tracking: (tr.get(r.id) as any) ?? null });

export const opportunitiesModule: ModuleDef = {
  name: 'opportunities',
  register(router) {
    router.get('/api/opportunities', { auth: 'active', query: z.object({ q: z.string().trim().max(80).optional(), type: z.enum(OPP_TYPES).optional(), mode: z.enum(['remote', 'hybrid', 'on_site']).optional(), tracked: z.enum(['1']).optional(), saved: z.enum(['1']).optional(), sort: z.enum(['deadline', 'recent']).default('deadline') }) }, async (c) => {
      const w = ["status = 'published'"]; const p: unknown[] = [];
      if (c.query.q) { p.push(likeTerm(c.query.q)); w.push(`(LOWER(title) LIKE $${p.length} ESCAPE '\\' OR LOWER(organisation) LIKE $${p.length} ESCAPE '\\' OR LOWER(description) LIKE $${p.length} ESCAPE '\\' OR LOWER(category) LIKE $${p.length} ESCAPE '\\')`); }
      if (c.query.type) { p.push(c.query.type); w.push(`type = $${p.length}`); }
      if (c.query.mode) { p.push(c.query.mode); w.push(`work_mode = $${p.length}`); }
      const rows = await c.db.query<any>(`SELECT * FROM opportunities WHERE ${w.join(' AND ')} ORDER BY ${c.query.sort === 'recent' ? 'created_at DESC' : 'deadline IS NULL, deadline'}, title`, p);
      const saved = await savedSet(c.db, c.me.userId, 'opportunity');
      const tr = new Map((await c.db.query<any>('SELECT opportunity_id, status FROM opportunity_tracking WHERE user_id = $1', [c.me.userId])).map((x) => [x.opportunity_id, x.status]));
      let items = rows.map((r) => oppCard(r, saved, tr));
      if (c.query.tracked) items = items.filter((i) => i.tracking);
      if (c.query.saved) items = items.filter((i) => i.saved);
      return { items, notice: items.some((i) => i.isDemo) ? NOTICE : null, types: OPP_TYPES };
    });
    router.get('/api/opportunities/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.get<any>("SELECT * FROM opportunities WHERE id = $1 AND status <> 'draft'", [c.params.id]);
      if (!r) throw notFound('We couldn’t find that listing.');
      const saved = await savedSet(c.db, c.me.userId, 'opportunity');
      const tr = new Map((await c.db.query<any>('SELECT opportunity_id, status FROM opportunity_tracking WHERE user_id = $1 AND opportunity_id = $2', [c.me.userId, r.id])).map((x) => [x.opportunity_id, x.status]));
      return { item: oppCard(r, saved, tr), notice: bool(r.is_demo) ? NOTICE : null };
    });
    router.put('/api/opportunities/:id/tracking', { auth: 'active', body: z.object({ status: z.enum(TRACK_STATUSES) }).strict() }, async (c) => {
      if (!(await c.db.get("SELECT 1 AS x FROM opportunities WHERE id = $1 AND status <> 'draft'", [c.params.id]))) throw notFound('We couldn’t find that listing.');
      const now = c.now().toISOString();
      const r = await c.db.run('UPDATE opportunity_tracking SET status = $3, updated_at = $4 WHERE user_id = $1 AND opportunity_id = $2', [c.me.userId, c.params.id, c.body.status, now]);
      if (!r.changes) await c.db.run('INSERT INTO opportunity_tracking (user_id, opportunity_id, status, updated_at) VALUES ($1,$2,$3,$4)', [c.me.userId, c.params.id, c.body.status, now]);
      return { ok: true, status: c.body.status };
    });
    router.delete('/api/opportunities/:id/tracking', { auth: 'active' }, async (c) => { await c.db.run('DELETE FROM opportunity_tracking WHERE user_id = $1 AND opportunity_id = $2', [c.me.userId, c.params.id]); return { ok: true }; });

    // ───────── mentors ─────────
    router.get('/api/mentors', { auth: 'active', query: z.object({ q: z.string().trim().max(80).optional() }) }, async (c) => {
      const rows = await c.db.query<any>("SELECT * FROM mentors WHERE status = 'active' ORDER BY name");
      const saved = await savedSet(c.db, c.me.userId, 'mentor');
      const req = new Set((await c.db.query<any>('SELECT mentor_id FROM mentor_requests WHERE user_id = $1', [c.me.userId])).map((x) => x.mentor_id));
      const q = c.query.q?.toLowerCase();
      const items: MentorCard[] = rows.map((r) => ({ id: r.id, name: r.name, headline: r.headline, bio: r.bio, expertise: tagsOf(r.expertise), availabilityNote: r.availability_note ?? null, art: r.art ?? null, isDemo: bool(r.is_demo), saved: saved.has(r.id), requested: req.has(r.id) }))
        .filter((m) => !q || `${m.name} ${m.headline} ${m.expertise.join(' ')}`.toLowerCase().includes(q));
      return { items, notice: 'Demo directory: these mentors are fictional and illustrative. A request is recorded for you, but nobody real receives it in this build.' };
    });
    router.post('/api/mentors/:id/requests', { auth: 'active', body: z.object({ message: z.string().trim().max(500).optional() }).strict(), rate: { key: 'mentor-request', limit: 10, windowMs: 3600_000 } }, async (c) => {
      const m = await c.db.get<any>("SELECT id, is_demo FROM mentors WHERE id = $1 AND status = 'active'", [c.params.id]);
      if (!m) throw notFound('We couldn’t find that mentor.');
      if (await c.db.get('SELECT 1 AS x FROM mentor_requests WHERE user_id = $1 AND mentor_id = $2', [c.me.userId, m.id])) throw conflict('You have already asked this mentor.', 'already_requested');
      await c.db.run('INSERT INTO mentor_requests (id, user_id, mentor_id, message, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [uuid(), c.me.userId, m.id, c.body.message ?? null, 'received', c.now().toISOString()]);
      return created({ ok: true, demo: bool(m.is_demo), note: bool(m.is_demo) ? 'Recorded. This is a demo mentor, so no real person will see it.' : 'Recorded.' });
    });
    router.delete('/api/mentors/:id/requests', { auth: 'active' }, async (c) => { await c.db.run('DELETE FROM mentor_requests WHERE user_id = $1 AND mentor_id = $2', [c.me.userId, c.params.id]); return { ok: true }; });
    router.get('/api/mentor-requests', { auth: 'active' }, async (c) => ({ items: (await c.db.query<any>('SELECT r.id, r.status, r.created_at, m.name, m.id AS mentor_id FROM mentor_requests r JOIN mentors m ON m.id = r.mentor_id WHERE r.user_id = $1 ORDER BY r.created_at DESC', [c.me.userId])).map((r) => ({ id: r.id, mentorId: r.mentor_id, mentorName: r.name, status: r.status, createdAt: r.created_at })) }));

    registerEraser('opportunities', async (db, userId) => {
      const a = await db.run('DELETE FROM opportunity_tracking WHERE user_id = $1', [userId]);
      const b = await db.run('DELETE FROM mentor_requests WHERE user_id = $1', [userId]);
      return { counts: { opportunity_tracking: a.changes, mentor_requests: b.changes } };
    });
    registerExporter('opportunities', async (db, userId) => ({
      tracking: await db.query('SELECT o.title, t.status, t.updated_at FROM opportunity_tracking t JOIN opportunities o ON o.id = t.opportunity_id WHERE t.user_id = $1', [userId]),
      mentorRequests: await db.query('SELECT m.name, r.message, r.status, r.created_at FROM mentor_requests r JOIN mentors m ON m.id = r.mentor_id WHERE r.user_id = $1', [userId]),
    }));
  },
};
