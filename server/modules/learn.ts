import { z } from 'zod';
import type { ModuleDef } from './types';
import { notFound } from '../http/errors';
import { bool, json } from '../db';
import { seedCatalog } from '../seed/catalog';
import { registerEraser, registerExporter } from '../services/erasure';
import { likeTerm, savedSet, tagsOf } from '../catalog/common';
import { LEARN_FORMATS, type LearnCard, type LearnDetail, type LearnFormat, type LearnList } from '../../shared/api/catalog';
import type { Db } from '../db';

const DEMO_NOTICE = 'Demo content: this entry illustrates how Learn works. It is not a live, reviewed catalogue.';

function card(r: any, saved: Set<string>, prog: Map<string, any>): LearnCard {
  const p = prog.get(r.id);
  return { id: r.id, slug: r.slug, format: r.format, title: r.title, summary: r.summary, category: r.category, level: r.level, minutes: r.minutes ?? null, art: r.art ?? null, tags: tagsOf(r.tags), isDemo: bool(r.is_demo), saved: saved.has(r.id), progress: p ? { status: p.status, percent: Number(p.percent) } : null, ...(r.n !== undefined && r.n !== null ? { pathItemCount: Number(r.n) } : {}) };
}
async function progressMap(db: Db, userId: string): Promise<Map<string, any>> {
  return new Map((await db.query<any>('SELECT item_id, status, percent FROM learn_progress WHERE user_id = $1', [userId])).map((r) => [r.item_id, r]));
}

export const learnModule: ModuleDef = {
  name: 'learn',
  async seed(s) { if (s.config.seedDemoData) await seedCatalog(s); },
  register(router) {
    router.get('/api/learn', { auth: 'active', query: z.object({
      q: z.string().trim().max(80).optional(), format: z.enum(LEARN_FORMATS).optional(), category: z.string().max(40).optional(), level: z.enum(['beginner', 'intermediate', 'advanced', 'all']).optional(),
      saved: z.enum(['1']).optional(), progress: z.enum(['in_progress', 'completed']).optional(), limit: z.coerce.number().int().min(1).max(100).default(60),
    }) }, async (c) => {
      const w: string[] = ["l.status = 'published'"]; const p: unknown[] = [];
      if (c.query.q) { p.push(likeTerm(c.query.q)); w.push(`(LOWER(l.title) LIKE $${p.length} ESCAPE '\\' OR LOWER(l.summary) LIKE $${p.length} ESCAPE '\\' OR LOWER(l.category) LIKE $${p.length} ESCAPE '\\' OR LOWER(CAST(l.tags AS TEXT)) LIKE $${p.length} ESCAPE '\\')`); }
      if (c.query.format) { p.push(c.query.format); w.push(`l.format = $${p.length}`); }
      if (c.query.category) { p.push(c.query.category); w.push(`l.category = $${p.length}`); }
      if (c.query.level) { p.push(c.query.level); w.push(`(l.level = $${p.length} OR l.level = 'all')`); }
      const [saved, prog] = [await savedSet(c.db, c.me.userId, 'learn'), await progressMap(c.db, c.me.userId)];
      const base = `FROM learn_items l WHERE ${w.join(' AND ')}`;
      const all = await c.db.query<any>(`SELECT l.*, (SELECT COUNT(*) FROM learn_path_items pi WHERE pi.path_id = l.id) AS n ${base} ORDER BY l.created_at DESC, l.title`, p);
      let rows = all;
      if (c.query.saved) rows = rows.filter((r) => saved.has(r.id));
      if (c.query.progress) rows = rows.filter((r) => prog.get(r.id)?.status === c.query.progress);
      const facets = await c.db.query<any>("SELECT category, format FROM learn_items WHERE status = 'published'");
      const count = (k: 'category' | 'format') => { const m = new Map<string, number>(); for (const f of facets) m.set(f[k], (m.get(f[k]) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, n]) => ({ key, count: n })); };
      const out: LearnList = { items: rows.slice(0, c.query.limit).map((r) => card(r, saved, prog)), total: rows.length, categories: count('category'), formats: count('format') as { key: LearnFormat; count: number }[], notice: rows.some((r) => bool(r.is_demo)) ? DEMO_NOTICE : null };
      return out;
    });

    router.get('/api/learn/:slug', { auth: 'active' }, async (c) => {
      const r = await c.db.get<any>("SELECT l.*, (SELECT COUNT(*) FROM learn_path_items pi WHERE pi.path_id = l.id) AS n FROM learn_items l WHERE l.slug = $1 AND l.status = 'published'", [c.params.slug]);
      if (!r) throw notFound('We couldn’t find that resource.');
      const [saved, prog] = [await savedSet(c.db, c.me.userId, 'learn'), await progressMap(c.db, c.me.userId)];
      const d: LearnDetail = { ...card(r, saved, prog), body: json(r.body, []), demoNotice: bool(r.is_demo) ? DEMO_NOTICE : null };
      if (r.format === 'path') {
        const items = await c.db.query<any>("SELECT l.* FROM learn_path_items pi JOIN learn_items l ON l.id = pi.item_id WHERE pi.path_id = $1 AND l.status = 'published' ORDER BY pi.sort_order", [r.id]);
        d.pathItems = items.map((i) => card(i, saved, prog));
        const done = d.pathItems.filter((i) => i.progress?.status === 'completed').length;
        d.progress = d.pathItems.length ? { status: done === d.pathItems.length ? 'completed' : 'in_progress', percent: Math.round((done / d.pathItems.length) * 100) } : d.progress;
        if (!done) d.progress = d.progress && d.progress.percent > 0 ? d.progress : null;
      }
      return { item: d };
    });

    // Progress is recorded per person. Quiz answers are graded here so the answer key is never trusted from the client.
    router.put('/api/learn/:slug/progress', { auth: 'active', body: z.object({ percent: z.number().int().min(0).max(100).optional(), completed: z.boolean().optional(), answers: z.record(z.string().max(20), z.number().int().min(0).max(10)).optional() }).strict(), rate: { key: 'learn-progress', limit: 120, windowMs: 60_000 } }, async (c) => {
      const r = await c.db.get<any>("SELECT id, format, body FROM learn_items WHERE slug = $1 AND status = 'published'", [c.params.slug]);
      if (!r) throw notFound('We couldn’t find that resource.');
      if (r.format === 'path') return { ok: true, note: 'A path completes as you complete its items.' };
      let data: Record<string, unknown> = {}; let percent = c.body.percent ?? 0; let completed = !!c.body.completed;
      if (r.format === 'quiz' && c.body.answers) {
        const qs = (json<any[]>(r.body, [])).filter((b) => b.t === 'question');
        const results = qs.map((q) => ({ id: q.id, correct: c.body.answers![q.id] === q.answer, explain: q.explain }));
        const score = results.filter((x) => x.correct).length;
        data = { score, total: qs.length, results }; percent = 100; completed = true;
      }
      if (completed) percent = 100;
      const now = c.now().toISOString();
      const had = await c.db.get('SELECT 1 AS x FROM learn_progress WHERE user_id = $1 AND item_id = $2', [c.me.userId, r.id]);
      if (had) await c.db.run('UPDATE learn_progress SET status = $3, percent = $4, data = $5, updated_at = $6, completed_at = $7 WHERE user_id = $1 AND item_id = $2', [c.me.userId, r.id, completed ? 'completed' : 'in_progress', percent, JSON.stringify(data), now, completed ? now : null]);
      else await c.db.run('INSERT INTO learn_progress (user_id, item_id, status, percent, data, updated_at, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [c.me.userId, r.id, completed ? 'completed' : 'in_progress', percent, JSON.stringify(data), now, completed ? now : null]);
      return { ok: true, status: completed ? 'completed' : 'in_progress', percent, result: (data as any).results ? data : undefined };
    });
    router.delete('/api/learn/:slug/progress', { auth: 'active' }, async (c) => {
      const r = await c.db.get<any>('SELECT id FROM learn_items WHERE slug = $1', [c.params.slug]);
      if (r) await c.db.run('DELETE FROM learn_progress WHERE user_id = $1 AND item_id = $2', [c.me.userId, r.id]);
      return { ok: true };
    });

    registerEraser('learn', async (db, userId) => ({ counts: { learn_progress: (await db.run('DELETE FROM learn_progress WHERE user_id = $1', [userId])).changes } }));
    registerExporter('learn', async (db, userId) => db.query('SELECT l.title, p.status, p.percent, p.updated_at FROM learn_progress p JOIN learn_items l ON l.id = p.item_id WHERE p.user_id = $1', [userId]));
  },
};
