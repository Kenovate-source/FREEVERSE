import { z } from 'zod';
import type { ModuleDef } from './types';
import { notFound } from '../http/errors';
import { bool } from '../db';
import { registerEraser, registerExporter } from '../services/erasure';
import { likeTerm, savedSet } from '../catalog/common';
import type { EventCard } from '../../shared/api/catalog';

const NOTICE = 'Demo events: these are illustrative. Your RSVP is saved for you, but no real event is hosted from this build.';

async function cards(c: any, rows: any[]): Promise<EventCard[]> {
  if (!rows.length) return [];
  const saved = await savedSet(c.db, c.me.userId, 'event');
  const mine = new Map((await c.db.query('SELECT event_id, response FROM event_rsvps WHERE user_id = $1', [c.me.userId])).map((x: any) => [x.event_id, x.response]));
  const counts = new Map<string, { yes: number; maybe: number }>();
  for (const r of (await c.db.query("SELECT event_id, response, COUNT(*) AS n FROM event_rsvps WHERE response IN ('yes','maybe') GROUP BY event_id, response")) as any[]) {
    const cur = counts.get(r.event_id) ?? { yes: 0, maybe: 0 }; cur[r.response as 'yes' | 'maybe'] = Number(r.n); counts.set(r.event_id, cur);
  }
  return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, category: r.category, format: r.format, location: r.location ?? null, startsAt: r.starts_at, endsAt: r.ends_at ?? null, capacity: r.capacity ?? null, art: r.art ?? null, isDemo: bool(r.is_demo), saved: saved.has(r.id), myResponse: (mine.get(r.id) as any) ?? null, counts: counts.get(r.id) ?? { yes: 0, maybe: 0 } }));
}

export const eventsModule: ModuleDef = {
  name: 'events',
  register(router) {
    router.get('/api/events', { auth: 'active', query: z.object({ q: z.string().trim().max(80).optional(), when: z.enum(['upcoming', 'past', 'mine']).default('upcoming'), format: z.enum(['virtual', 'in_person', 'hybrid']).optional() }) }, async (c) => {
      const p: unknown[] = [c.now().toISOString()]; const w = ["status = 'published'", c.query.when === 'past' ? 'starts_at < $1' : 'starts_at >= $1'];
      if (c.query.format) { p.push(c.query.format); w.push(`format = $${p.length}`); }
      if (c.query.q) { p.push(likeTerm(c.query.q)); w.push(`(LOWER(title) LIKE $${p.length} ESCAPE '\\' OR LOWER(description) LIKE $${p.length} ESCAPE '\\' OR LOWER(category) LIKE $${p.length} ESCAPE '\\')`); }
      if (c.query.when === 'mine') { p.push(c.me.userId); w.push(`id IN (SELECT event_id FROM event_rsvps WHERE user_id = $${p.length} AND response <> 'no')`); }
      const rows = await c.db.query<any>(`SELECT * FROM events WHERE ${w.join(' AND ')} ORDER BY starts_at ${c.query.when === 'past' ? 'DESC' : ''}`, p);
      const items = await cards(c, rows);
      return { items, notice: items.some((i) => i.isDemo) ? NOTICE : null };
    });
    router.get('/api/events/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.get<any>("SELECT * FROM events WHERE id = $1 AND status <> 'draft'", [c.params.id]);
      if (!r) throw notFound('We couldn’t find that event.');
      return { item: (await cards(c, [r]))[0], notice: bool(r.is_demo) ? NOTICE : null };
    });
    router.put('/api/events/:id/rsvp', { auth: 'active', body: z.object({ response: z.enum(['yes', 'maybe', 'no']) }).strict() }, async (c) => {
      if (!(await c.db.get("SELECT 1 AS x FROM events WHERE id = $1 AND status = 'published'", [c.params.id]))) throw notFound('We couldn’t find that event.');
      const now = c.now().toISOString();
      const r = await c.db.run('UPDATE event_rsvps SET response = $3, updated_at = $4 WHERE event_id = $1 AND user_id = $2', [c.params.id, c.me.userId, c.body.response, now]);
      if (!r.changes) await c.db.run('INSERT INTO event_rsvps (event_id, user_id, response, updated_at) VALUES ($1,$2,$3,$4)', [c.params.id, c.me.userId, c.body.response, now]);
      return { ok: true, response: c.body.response };
    });
    router.delete('/api/events/:id/rsvp', { auth: 'active' }, async (c) => { await c.db.run('DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [c.params.id, c.me.userId]); return { ok: true }; });

    registerEraser('events', async (db, userId) => ({ counts: { event_rsvps: (await db.run('DELETE FROM event_rsvps WHERE user_id = $1', [userId])).changes } }));
    registerExporter('events', async (db, userId) => db.query('SELECT e.title, r.response, r.updated_at FROM event_rsvps r JOIN events e ON e.id = r.event_id WHERE r.user_id = $1', [userId]));
  },
};
