import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound, forbidden } from '../http/errors';
import { created } from '../http/router';
import { uuid } from '../db';
import { sqlPostVisible } from '../policy/visibility';
import { notify } from '../services/notify';
import { registerEraser, registerExporter } from '../services/erasure';
import { GAMES, templateFor } from '../../shared/universe-spaces';
import { UNIVERSE_IDS } from '../../shared/universes';

const id = z.string().uuid();
const gameIds = GAMES.map((g) => g.id) as [string, ...string[]];

export const universeSpacesModule: ModuleDef = {
  name: 'universe-spaces',
  register(router, s) {
    // What exists in a Universe right now: counts per template (published posts the viewer may see) and how many people have contributed.
    router.get('/api/universes/:id/stats', { auth: 'active' }, async (c) => {
      const uid = z.enum(UNIVERSE_IDS).safeParse(c.params.id);
      if (!uid.success) throw notFound('Unknown Universe.');
      const rows = await c.db.query<{ template: string; n: number }>(
        `SELECT p.template, COUNT(*) AS n FROM posts p LEFT JOIN users pu ON pu.id = p.author_id WHERE p.universe = $2 AND ${sqlPostVisible('$1')} GROUP BY p.template`, [c.me.userId, uid.data]);
      const contributors = await c.db.get<{ n: number }>(
        `SELECT COUNT(DISTINCT p.author_id) AS n FROM posts p LEFT JOIN users pu ON pu.id = p.author_id WHERE p.universe = $2 AND ${sqlPostVisible('$1')}`, [c.me.userId, uid.data]);
      return { templates: Object.fromEntries(rows.map((r) => [r.template, Number(r.n)])), contributors: Number(contributors?.n ?? 0) };
    });

    // "I'm in": study partner, project help, volunteering, experiments, watch-alongs. Members see a count; only the author sees who.
    const loadParticipable = async (c: { db: typeof s.db; me: { userId: string }; params: Record<string, string> }) => {
      const pid = id.safeParse(c.params.id);
      if (!pid.success) throw notFound();
      const row = await c.db.get<any>(`SELECT p.id, p.author_id, p.universe, p.template, p.title FROM posts p LEFT JOIN users pu ON pu.id = p.author_id WHERE p.id = $2 AND ${sqlPostVisible('$1')}`, [c.me.userId, pid.data]);
      if (!row || !row.universe || !row.template || !templateFor(row.universe, row.template)?.participation) throw notFound('We couldn’t find that.');
      return row;
    };
    router.put('/api/posts/:id/participation', { auth: 'active', rate: { key: 'participation', limit: 60, windowMs: 3600_000 } }, async (c) => {
      const row = await loadParticipable(c);
      if (row.author_id === c.me.userId) throw conflict('This is your own post.', 'own_post');
      const had = await c.db.get('SELECT 1 AS x FROM post_participation WHERE post_id = $1 AND user_id = $2', [row.id, c.me.userId]);
      if (!had) {
        await c.db.run('INSERT INTO post_participation (post_id, user_id, created_at) VALUES ($1,$2,$3)', [row.id, c.me.userId, c.now().toISOString()]);
        if (row.author_id) await notify(c.db, { userId: row.author_id, type: 'system', actorId: c.me.userId, targetType: 'post', targetId: row.id, data: { text: `Someone joined “${row.title ?? 'your post'}”. Open it to see who.`, href: `#/post/${row.id}` } }, c.now());
      }
      const n = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM post_participation WHERE post_id = $1', [row.id]);
      return { joined: true, count: Number(n?.n ?? 0) };
    });
    router.delete('/api/posts/:id/participation', { auth: 'active' }, async (c) => {
      const row = await loadParticipable(c);
      await c.db.run('DELETE FROM post_participation WHERE post_id = $1 AND user_id = $2', [row.id, c.me.userId]);
      const n = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM post_participation WHERE post_id = $1', [row.id]);
      return { joined: false, count: Number(n?.n ?? 0) };
    });
    router.get('/api/posts/:id/participants', { auth: 'active' }, async (c) => {
      const row = await loadParticipable(c);
      if (row.author_id !== c.me.userId) throw forbidden('Only the author can see who joined.', 'permission_denied');
      const rows = await c.db.query<any>(
        `SELECT u.id, u.handle, u.display_name, pp.created_at FROM post_participation pp JOIN users u ON u.id = pp.user_id
          WHERE pp.post_id = $1 AND u.status = 'active' AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $2)) ORDER BY pp.created_at`, [row.id, c.me.userId]);
      return { items: rows.map((r) => ({ handle: r.handle, displayName: r.display_name, at: r.created_at })) };
    });

    // ───────── games: single-player, in the browser. The server only keeps scores. ─────────
    const gameDef = (g: string) => GAMES.find((x) => x.id === g)!;
    router.post('/api/games/:game/scores', {
      auth: 'active', rate: { key: 'game:score', limit: 60, windowMs: 3600_000 },
      body: z.object({ score: z.number().int().min(0).max(1_000_000), showName: z.boolean().default(false) }).strict(),
    }, async (c) => {
      const g = z.enum(gameIds).safeParse(c.params.game);
      if (!g.success) throw notFound('Unknown game.');
      const d = gameDef(g.data);
      if (c.body.score > d.max) throw conflict('That score is not possible in this game.', 'implausible_score');
      await c.db.run('INSERT INTO game_scores (id, user_id, game, score, show_name, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [uuid(), c.me.userId, g.data, c.body.score, c.body.showName, c.now().toISOString()]);
      return created({ ok: true });
    });
    router.get('/api/games/:game/scores', { auth: 'active' }, async (c) => {
      const g = z.enum(gameIds).safeParse(c.params.game);
      if (!g.success) throw notFound('Unknown game.');
      const d = gameDef(g.data); const agg = d.lowerIsBetter ? 'MIN' : 'MAX'; const order = d.lowerIsBetter ? 'ASC' : 'DESC';
      const mine = await c.db.get<{ best: number | null; plays: number }>(`SELECT ${agg}(score) AS best, COUNT(*) AS plays FROM game_scores WHERE user_id = $1 AND game = $2`, [c.me.userId, g.data]);
      // Only people who ticked "show my name" appear, once each, with their best score.
      const top = await c.db.query<any>(
        `SELECT u.display_name, u.handle, ${agg}(gs.score) AS best FROM game_scores gs JOIN users u ON u.id = gs.user_id
          WHERE gs.game = $1 AND gs.show_name = $2 AND u.status = 'active' GROUP BY u.id, u.display_name, u.handle ORDER BY best ${order}, u.handle LIMIT 10`, [g.data, true]);
      return { game: g.data, scoreLabel: d.scoreLabel, lowerIsBetter: d.lowerIsBetter, mine: { best: mine?.best ?? null, plays: Number(mine?.plays ?? 0) }, top: top.map((r, i) => ({ rank: i + 1, name: r.display_name ?? r.handle, score: Number(r.best) })), note: 'Scores are reported by your browser and can’t be verified, so this board is just for fun.' };
    });

    registerEraser('post_participation', async (db, userId) => ({ counts: { post_participation: (await db.run('DELETE FROM post_participation WHERE user_id = $1', [userId])).changes } }));
    registerExporter('post_participation', async (db, userId) => db.query('SELECT post_id, created_at FROM post_participation WHERE user_id = $1', [userId]));
    registerEraser('game_scores', async (db, userId) => ({ counts: { game_scores: (await db.run('DELETE FROM game_scores WHERE user_id = $1', [userId])).changes } }));
    registerExporter('game_scores', async (db, userId) => db.query('SELECT game, score, created_at FROM game_scores WHERE user_id = $1', [userId]));
  },
};

