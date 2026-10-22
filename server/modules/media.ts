import { z } from 'zod';
import type { ModuleDef } from './types';
import { binary, created } from '../http/router';
import { conflict, notFound, forbidden } from '../http/errors';
import { uuid } from '../db';
import { processImage } from '../media/images';
import { signedMediaUrl, verifyMediaToken } from '../services/media-urls';
import { MEDIA_LIMITS, type MediaItem, type MediaPurpose } from '../../shared/api/media';
import { registerEraser, registerExporter } from '../services/erasure';
import type { Services } from '../services';

const id = z.string().uuid();
const toItem = (s: Services, viewerId: string, r: any): MediaItem => ({
  id: r.id, purpose: r.purpose, mime: r.mime, bytes: Number(r.bytes), width: r.width ?? null, height: r.height ?? null, altText: r.alt_text ?? null,
  url: signedMediaUrl(s, viewerId, r.id), createdAt: r.created_at,
});

/** Thin wrapper for other modules: mint a signed URL AFTER you have checked the viewer may see the media. */
export const mediaUrlFor = (s: Services, viewerId: string, mediaId: string): string => signedMediaUrl(s, viewerId, mediaId);

export const mediaModule: ModuleDef = {
  name: 'media',
  register(router, s) {
    router.post('/api/media', {
      auth: 'active',
      raw: { maxBytes: MEDIA_LIMITS.maxBytes + 1024 },
      query: z.object({ purpose: z.enum(['avatar', 'cover', 'post', 'showcase']) }),
      rate: { key: 'media:upload', limit: 30, windowMs: 10 * 60_000 },
    }, async (c) => {
      const purpose = c.query.purpose as MediaPurpose;
      const count = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM media WHERE owner_id = $1 AND deleted_at IS NULL', [c.me.userId]);
      if (Number(count?.n ?? 0) >= MEDIA_LIMITS.quota) throw conflict('You have reached the upload limit. Delete some images to add more.', 'quota_exceeded');
      const img = await processImage(c.rawBody ?? Buffer.alloc(0), c.header('content-type'), purpose);
      const mid = uuid();
      const key = `media/${c.now().getUTCFullYear()}/${mid}.webp`;
      await s.storage.put(key, img.data, img.mime);
      try {
        await c.db.run('INSERT INTO media (id, owner_id, purpose, mime, bytes, width, height, storage_key, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [mid, c.me.userId, purpose, img.mime, img.data.length, img.width, img.height, key, c.now().toISOString()]);
      } catch (e) { await s.storage.delete(key).catch(() => {}); throw e; }
      const row = await c.db.get<any>('SELECT * FROM media WHERE id = $1', [mid]);
      return created({ media: toItem(s, c.me.userId, row) });
    });

    // Authorized by the signed token (minted only after a visibility check), not by a bearer header: <img> cannot send one.
    router.get('/api/media/:id', { auth: 'none', query: z.object({ v: z.string().optional(), e: z.string().optional(), s: z.string().optional() }) }, async (c) => {
      const mid = id.safeParse(c.params.id);
      if (!mid.success || !verifyMediaToken(s, mid.data, c.query)) throw notFound('Not found.');
      const row = await c.db.get<any>(
        `SELECT m.storage_key, m.mime FROM media m JOIN users u ON u.id = m.owner_id WHERE m.id = $1 AND m.deleted_at IS NULL AND u.status IN ('active','suspended')`, [mid.data]);
      if (!row) throw notFound('Not found.');
      const file = await s.storage.get(row.storage_key);
      if (!file) throw notFound('Not found.');
      return binary(file.data, row.mime, { 'cache-control': 'private, max-age=1500', 'content-disposition': 'inline', 'cross-origin-resource-policy': 'same-origin', 'x-content-type-options': 'nosniff' });
    });

    router.get('/api/media', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>('SELECT * FROM media WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 300', [c.me.userId]);
      return { items: rows.map((r) => toItem(s, c.me.userId, r)), quota: MEDIA_LIMITS.quota };
    });

    router.patch('/api/media/:id', { auth: 'active', body: z.object({ altText: z.string().trim().max(200).nullable() }) }, async (c) => {
      const mid = id.parse(c.params.id);
      const r = await c.db.run('UPDATE media SET alt_text = $3 WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL', [mid, c.me.userId, c.body.altText || null]);
      if (!r.changes) throw notFound();
      return { media: toItem(s, c.me.userId, await c.db.get('SELECT * FROM media WHERE id = $1', [mid])) };
    });

    router.delete('/api/media/:id', { auth: 'active' }, async (c) => {
      const parsed = id.safeParse(c.params.id);
      if (!parsed.success) throw notFound();
      const row = await c.db.get<any>('SELECT id, owner_id, storage_key FROM media WHERE id = $1', [parsed.data]);
      if (!row) throw notFound();
      if (row.owner_id !== c.me.userId) throw notFound(); // never confirm someone else's media exists
      await c.db.tx(async (t) => {
        await t.run("UPDATE profiles SET avatar_media_id = NULL, avatar_mode = 'avatar', updated_at = $2 WHERE avatar_media_id = $1", [row.id, c.now().toISOString()]);
        await t.run("UPDATE profiles SET cover_media_id = NULL, cover_mode = 'preset', updated_at = $2 WHERE cover_media_id = $1", [row.id, c.now().toISOString()]);
        await t.run('DELETE FROM media WHERE id = $1', [row.id]); // post_media cascades, profile_entries.media_id is SET NULL
      });
      await s.storage.delete(row.storage_key).catch((e) => c.log.warn('storage_delete_failed', { err: String(e) }));
      return { ok: true };
    });

    registerEraser('media', async (db, userId, ctx) => {
      const rows = await db.query<{ storage_key: string }>('SELECT storage_key FROM media WHERE owner_id = $1', [userId]);
      await db.run("UPDATE profiles SET avatar_media_id = NULL, cover_media_id = NULL WHERE user_id = $1", [userId]);
      const del = await db.run('DELETE FROM media WHERE owner_id = $1', [userId]);
      return { counts: { media: del.changes }, afterCommit: async () => { for (const r of rows) await ctx.storage.delete(r.storage_key).catch(() => {}); } };
    });
    registerExporter('media', async (db, userId) => (await db.query<any>('SELECT id, purpose, mime, bytes, width, height, alt_text, created_at FROM media WHERE owner_id = $1 ORDER BY created_at', [userId])));
  },
};
void forbidden;
