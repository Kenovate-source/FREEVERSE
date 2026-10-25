import { z } from 'zod';
import type { ModuleDef } from './types';
import { notFound } from '../http/errors';
import { UNIVERSES, UNIVERSE_STATUS_LABEL, type UniverseStatus } from '../../shared/universes';
import { cfgGet } from '../governance/actions';
import { registerEraser, registerExporter } from '../services/erasure';
import type { UniverseView } from '../../shared/api/catalog';

export const universesModule: ModuleDef = {
  name: 'universes',
  register(router) {
    router.get('/api/universes', { auth: 'active' }, async (c) => {
      const ov = await cfgGet<Record<string, { status: UniverseStatus; note?: string }>>(c.db, 'universes.status', {});
      const mine = new Set((await c.db.query<any>('SELECT feature_key FROM feature_interest WHERE user_id = $1', [c.me.userId])).map((r) => r.feature_key));
      const counts = new Map((await c.db.query<any>('SELECT feature_key, COUNT(*) AS n FROM feature_interest GROUP BY feature_key')).map((r) => [r.feature_key, Number(r.n)]));
      const items: UniverseView[] = UNIVERSES.map((u) => {
        const status: UniverseStatus = ov[u.id]?.status ?? u.status;
        return { id: u.id, name: u.name, tagline: u.tagline, description: u.description, status, statusLabel: UNIVERSE_STATUS_LABEL[status], today: u.today, route: status === 'available' || status === 'partial' ? u.route ?? null : null, basis: u.basis, accent: u.accent, note: ov[u.id]?.note ?? null, interested: mine.has(`universe:${u.id}`), interestedCount: counts.get(`universe:${u.id}`) ?? 0 };
      });
      return { items };
    });
    // "Tell me when this exists": a real, private, persisted signal. It is not a pre-order and promises no date.
    router.put('/api/interest/:key', { auth: 'active', rate: { key: 'interest', limit: 60, windowMs: 60_000 } }, async (c) => {
      const key = String(c.params.key);
      if (!/^(universe:[a-z]+|feature:[a-z_]+)$/.test(key)) throw notFound('Unknown item.');
      if (key.startsWith('universe:') && !UNIVERSES.some((u) => `universe:${u.id}` === key)) throw notFound('Unknown Universe.');
      if (!(await c.db.get('SELECT 1 AS x FROM feature_interest WHERE user_id = $1 AND feature_key = $2', [c.me.userId, key]))) await c.db.run('INSERT INTO feature_interest (user_id, feature_key, created_at) VALUES ($1,$2,$3)', [c.me.userId, key, c.now().toISOString()]);
      return { ok: true, interested: true };
    });
    router.delete('/api/interest/:key', { auth: 'active' }, async (c) => { await c.db.run('DELETE FROM feature_interest WHERE user_id = $1 AND feature_key = $2', [c.me.userId, String(c.params.key)]); return { ok: true, interested: false }; });
    router.get('/api/interest', { auth: 'active', query: z.object({}) }, async (c) => ({ keys: (await c.db.query<any>('SELECT feature_key FROM feature_interest WHERE user_id = $1', [c.me.userId])).map((r) => r.feature_key) }));

    registerEraser('feature_interest', async (db, userId) => ({ counts: { feature_interest: (await db.run('DELETE FROM feature_interest WHERE user_id = $1', [userId])).changes } }));
    registerExporter('feature_interest', async (db, userId) => db.query('SELECT feature_key, created_at FROM feature_interest WHERE user_id = $1', [userId]));
  },
};
