import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound } from '../http/errors';
import { created } from '../http/router';
import { uuid } from '../db';
import { loadVisiblePost } from './posts';
import { registerEraser, registerExporter } from '../services/erasure';
import type { CollectionView, SavedItemView, SavedKind } from '../../shared/api/content';
import type { Db } from '../db';

const KINDS = ['post', 'learn', 'opportunity', 'event', 'mentor', 'community', 'member'] as const;
const id = z.string().uuid();

/** Resolves what a saved row points at, as THIS viewer may see it. Missing or no-longer-visible targets come back unavailable. */
async function resolve(db: Db, viewerId: string, kind: SavedKind, ref: string): Promise<{ title: string | null; subtitle: string | null; href: string | null }> {
  const none = { title: null, subtitle: null, href: null };
  switch (kind) {
    case 'post': {
      const p = await loadVisiblePost(db, viewerId, ref);
      if (!p) return none;
      return { title: p.title ?? String(p.body).slice(0, 80), subtitle: p.c_name ?? 'Post', href: `#/post/${p.id}` };
    }
    case 'learn': { const r = await db.get<any>("SELECT title, format, slug FROM learn_items WHERE id = $1 AND status = 'published'", [ref]); return r ? { title: r.title, subtitle: `Learn · ${r.format}`, href: `#/learn/${r.slug}` } : none; }
    case 'opportunity': { const r = await db.get<any>("SELECT title, organisation FROM opportunities WHERE id = $1 AND status <> 'draft'", [ref]); return r ? { title: r.title, subtitle: r.organisation, href: `#/opportunities/${ref}` } : none; }
    case 'event': { const r = await db.get<any>("SELECT title, starts_at FROM events WHERE id = $1 AND status <> 'draft'", [ref]); return r ? { title: r.title, subtitle: `Event · ${String(r.starts_at).slice(0, 10)}`, href: `#/events/${ref}` } : none; }
    case 'mentor': { const r = await db.get<any>("SELECT name, headline FROM mentors WHERE id = $1", [ref]); return r ? { title: r.name, subtitle: r.headline, href: `#/mentors/${ref}` } : none; }
    case 'community': { const r = await db.get<any>("SELECT name, slug FROM communities WHERE id = $1 AND status = 'active'", [ref]); return r ? { title: r.name, subtitle: 'Community', href: `#/communities/${r.slug}` } : none; }
    case 'member': {
      const r = await db.get<any>("SELECT u.handle, u.display_name FROM users u WHERE u.id = $1 AND u.status = 'active' AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $2))", [ref, viewerId]);
      return r ? { title: r.display_name ?? r.handle, subtitle: r.handle ? `@${r.handle}` : 'Member', href: r.handle ? `#/u/${r.handle}` : null } : none;
    }
  }
}

export const savesModule: ModuleDef = {
  name: 'saves',
  register(router) {
    router.get('/api/saved', { auth: 'active', query: z.object({ kind: z.enum(KINDS).optional(), collection: id.optional() }) }, async (c) => {
      const params: unknown[] = [c.me.userId]; let w = '';
      if (c.query.kind) { params.push(c.query.kind); w += ` AND kind = $${params.length}`; }
      if (c.query.collection) { params.push(c.query.collection); w += ` AND collection_id = $${params.length}`; }
      const rows = await c.db.query<any>(`SELECT * FROM saved_items WHERE user_id = $1${w} ORDER BY created_at DESC LIMIT 300`, params);
      const items: SavedItemView[] = [];
      for (const r of rows) {
        const x = await resolve(c.db, c.me.userId, r.kind, r.ref_id);
        items.push({ id: r.id, kind: r.kind, refId: r.ref_id, collectionId: r.collection_id ?? null, createdAt: r.created_at, ...x, available: !!x.title });
      }
      const collections = await c.db.query<any>('SELECT c.id, c.name, (SELECT COUNT(*) FROM saved_items s WHERE s.collection_id = c.id) AS n FROM collections c WHERE c.user_id = $1 ORDER BY c.name', [c.me.userId]);
      return { items, collections: collections.map((x): CollectionView => ({ id: x.id, name: x.name, count: Number(x.n) })) };
    });

    router.put('/api/saved', { auth: 'active', body: z.object({ kind: z.enum(KINDS), refId: id, collectionId: id.nullable().optional() }).strict(), rate: { key: 'saved', limit: 120, windowMs: 60_000 } }, async (c) => {
      const x = await resolve(c.db, c.me.userId, c.body.kind, c.body.refId);
      if (!x.title) throw notFound('We couldn’t find that item.');
      if (c.body.collectionId && !(await c.db.get('SELECT 1 AS x FROM collections WHERE id = $1 AND user_id = $2', [c.body.collectionId, c.me.userId]))) throw notFound('That collection does not exist.');
      const had = await c.db.get<{ id: string }>('SELECT id FROM saved_items WHERE user_id = $1 AND kind = $2 AND ref_id = $3', [c.me.userId, c.body.kind, c.body.refId]);
      if (had) { if (c.body.collectionId !== undefined) await c.db.run('UPDATE saved_items SET collection_id = $2 WHERE id = $1', [had.id, c.body.collectionId]); return { ok: true, id: had.id }; }
      const n = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM saved_items WHERE user_id = $1', [c.me.userId]);
      if (Number(n?.n) >= 1000) throw conflict('You have reached the saved items limit.', 'quota_exceeded');
      const sid = uuid();
      await c.db.run('INSERT INTO saved_items (id, user_id, kind, ref_id, collection_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [sid, c.me.userId, c.body.kind, c.body.refId, c.body.collectionId ?? null, c.now().toISOString()]);
      return created({ ok: true, id: sid });
    });

    router.delete('/api/saved', { auth: 'active', query: z.object({ kind: z.enum(KINDS), refId: id }) }, async (c) => {
      await c.db.run('DELETE FROM saved_items WHERE user_id = $1 AND kind = $2 AND ref_id = $3', [c.me.userId, c.query.kind, c.query.refId]);
      return { ok: true };
    });

    router.post('/api/collections', { auth: 'active', body: z.object({ name: z.string().trim().min(1).max(40) }).strict() }, async (c) => {
      if (await c.db.get('SELECT 1 AS x FROM collections WHERE user_id = $1 AND name = $2', [c.me.userId, c.body.name])) throw conflict('You already have a collection with that name.', 'name_taken');
      const n = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM collections WHERE user_id = $1', [c.me.userId]);
      if (Number(n?.n) >= 30) throw conflict('You have reached the collection limit.', 'quota_exceeded');
      const cid = uuid();
      await c.db.run('INSERT INTO collections (id, user_id, name, created_at) VALUES ($1,$2,$3,$4)', [cid, c.me.userId, c.body.name, c.now().toISOString()]);
      return created({ collection: { id: cid, name: c.body.name, count: 0 } satisfies CollectionView });
    });
    router.patch('/api/collections/:id', { auth: 'active', body: z.object({ name: z.string().trim().min(1).max(40) }).strict() }, async (c) => {
      const r = await c.db.run('UPDATE collections SET name = $3 WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId, c.body.name]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });
    router.delete('/api/collections/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM collections WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    registerEraser('saves', async (db, userId) => {
      const a = await db.run('DELETE FROM saved_items WHERE user_id = $1', [userId]);
      await db.run('DELETE FROM collections WHERE user_id = $1', [userId]);
      return { counts: { saved_items: a.changes } };
    });
    registerExporter('saves', async (db, userId) => db.query('SELECT kind, ref_id, created_at FROM saved_items WHERE user_id = $1', [userId]));
  },
};
