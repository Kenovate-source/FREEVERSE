import { z } from 'zod';
import type { ModuleDef } from './types';
import { notFound } from '../http/errors';
import { json } from '../db';
import { personCards } from '../services/people';
import { aliasLabel } from '../content/anonymity';
import { registerEraser, registerExporter } from '../services/erasure';
import type { NotificationView } from '../../shared/api/content';

const TEXT: Record<string, (who: string, d: any) => string> = {
  comment: (w, d) => `${w} commented on your post${d.postTitle ? ` “${String(d.postTitle).slice(0, 50)}”` : ''}`,
  reply: (w) => `${w} replied to your comment`,
  reaction: (w, d) => `${w} reacted (${d.kind ?? 'like'}) to your ${d.postId ? 'post or comment' : 'content'}`,
  mention: (w) => `${w} mentioned you`,
  follow: (w) => `${w} followed you`,
  connection: (w) => `${w} is now connected with you`,
  message: (w) => `${w} sent you a message`,
  message_request: (w) => `${w} wants to message you`,
  moderation: () => 'A moderator took action on your content. Open for details and how to appeal.',
  system: (_w, d) => String(d.text ?? 'Update from FREEVERSE'),
  appeal: () => 'Your appeal has a decision.',
  report_update: () => 'There is an update on a report you made.',
};

function hrefFor(n: any, d: any): string | null {
  if (d.href && typeof d.href === 'string' && d.href.startsWith('#/')) return d.href;
  if (d.postId) return `#/post/${d.postId}`;
  if (n.type === 'follow' || n.type === 'connection') return n.handle ? `#/u/${n.handle}` : null;
  if (n.type === 'message' || n.type === 'message_request') return d.conversationId ? `#/messages/${d.conversationId}` : '#/messages';
  if (n.type === 'moderation' || n.type === 'appeal') return '#/settings/safety';
  return null;
}

export const notificationsModule: ModuleDef = {
  name: 'notifications',
  register(router, s) {
    router.get('/api/notifications', { auth: 'active', query: z.object({ unread: z.enum(['1']).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }) }, async (c) => {
      const rows = await c.db.query<any>(
        `SELECT n.*, u.handle FROM notifications n LEFT JOIN users u ON u.id = n.actor_id WHERE n.user_id = $1 ${c.query.unread ? 'AND n.read_at IS NULL' : ''} ORDER BY n.created_at DESC LIMIT ${c.query.limit}`, [c.me.userId]);
      const cards = await personCards(s, c.me.userId, rows.map((r) => r.actor_id));
      const items: NotificationView[] = [];
      for (const r of rows) {
        const d = json<any>(r.data, {});
        const anon = !!(r.actor_anonymous === true || r.actor_anonymous === 1);
        const card = r.actor_id ? cards.get(r.actor_id) : null;
        if (card?.restricted) continue; // a blocked person's old notifications disappear
        const who = anon ? 'Someone (anonymous)' : card?.displayName ?? 'Someone';
        const f = TEXT[r.type] ?? (() => 'You have a notification');
        items.push({
          id: r.id, type: r.type, createdAt: r.created_at, readAt: r.read_at ?? null,
          actor: anon ? { anonymous: true, alias: aliasLabel(1).replace(/ \d+$/, '') } : card ? { anonymous: false, person: card } : null,
          text: f(who, d), href: hrefFor(r, d),
        });
      }
      const unread = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [c.me.userId]);
      return { items, unreadCount: Number(unread?.n ?? 0) };
    });

    router.get('/api/notifications/count', { auth: 'active' }, async (c) => {
      const r = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [c.me.userId]);
      return { unreadCount: Number(r?.n ?? 0) };
    });

    router.post('/api/notifications/read', { auth: 'active', body: z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).strict() }, async (c) => {
      const now = c.now().toISOString();
      if (c.body.ids?.length) { for (const i of c.body.ids) await c.db.run('UPDATE notifications SET read_at = $3 WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [i, c.me.userId, now]); }
      else await c.db.run('UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL', [c.me.userId, now]);
      return { ok: true };
    });

    router.delete('/api/notifications/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    registerEraser('notifications', async (db, userId) => {
      const a = await db.run('DELETE FROM notifications WHERE user_id = $1', [userId]);
      const b = await db.run('DELETE FROM notifications WHERE actor_id = $1', [userId]); // notifications others received because of this person
      return { counts: { notifications: a.changes + b.changes } };
    });
    registerExporter('notifications', async (db, userId) => db.query('SELECT type, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]));
  },
};
