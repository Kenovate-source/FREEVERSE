import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { json, uuid } from '../db';
import { personCards, deletedCard } from '../services/people';
import { relation } from '../policy/visibility';
import { notify } from '../services/notify';
import { loadSettings, loadPrivacy } from '../profile/common';
import { registerEraser, registerExporter } from '../services/erasure';
import { MESSAGE_LIMITS, type ConversationView, type MessageView } from '../../shared/api/messages';
import type { Services } from '../services';
import type { Db } from '../db';

const id = z.string().uuid();
const text = z.string().trim().min(1, 'Write a message first.').max(MESSAGE_LIMITS.bodyMax);
const directKey = (a: string, b: string) => [a, b].sort().join(':');

/** Can `sender` open a conversation with `target`? Returns a plain reason when not. Deliberately vague about blocks. */
async function mayStart(db: Db, sender: string, target: string): Promise<{ ok: true; asRequest: boolean } | { ok: false; reason: string }> {
  const rel = await relation(db, sender, target);
  const unavailable = { ok: false as const, reason: 'You can’t message this person.' };
  if (rel.blocked) return unavailable;
  const u = await db.get<{ status: string }>('SELECT status FROM users WHERE id = $1', [target]);
  if (!u || u.status !== 'active') return unavailable;
  const priv = await loadPrivacy(db, target);
  if (priv.who_can_message === 'nobody') return unavailable;
  if (priv.who_can_message === 'connections' && !rel.connection) return unavailable;
  // Someone the recipient doesn't follow arrives as a request, unless the recipient turned requests off.
  const asRequest = !rel.followedBy;
  if (asRequest && !(await loadSettings(db, target)).messaging.allowMessageRequests) return unavailable;
  return { ok: true, asRequest };
}

async function views(s: Services, me: string, rows: any[]): Promise<ConversationView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const others = await s.db.query<{ conversation_id: string; user_id: string }>(
    `SELECT conversation_id, user_id FROM conversation_members WHERE user_id <> $1 AND conversation_id IN (${ids.map((_, i) => `$${i + 2}`).join(',')})`, [me, ...ids]);
  const otherBy = new Map(others.map((o) => [o.conversation_id, o.user_id]));
  const cards = await personCards(s, me, others.map((o) => o.user_id));
  const out: ConversationView[] = [];
  for (const r of rows) {
    const oid = otherBy.get(r.id);
    const card = oid ? cards.get(oid) ?? deletedCard() : deletedCard();
    if (card.restricted) continue; // blocked either way: conversation disappears from the list
    const last = await s.db.get<any>('SELECT body, created_at, sender_id, deleted_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [r.id]);
    const unread = r.last_read_at
      ? await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL AND (sender_id IS NULL OR sender_id <> $2) AND created_at > $3', [r.id, me, r.last_read_at])
      : await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL AND (sender_id IS NULL OR sender_id <> $2)', [r.id, me]);
    let canSend = r.my_status === 'accepted' || r.my_status === 'request';
    let reason: string | null = null;
    if (card.deleted) { canSend = false; reason = 'This account no longer exists.'; }
    else if (r.my_status === 'declined') { canSend = false; reason = 'You declined this conversation.'; }
    else if (r.their_status === 'declined') { canSend = false; reason = 'You can’t send more messages in this conversation.'; }
    else if (r.their_status === 'request') {
      const mine = await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND sender_id = $2', [r.id, me]);
      if (Number(mine?.n) >= 1) { canSend = false; reason = 'Your message is waiting for them to accept. You can send more once they do.'; }
    }
    out.push({
      id: r.id, other: card, status: r.my_status, awaitingAcceptance: r.their_status === 'request', unread: Number(unread?.n ?? 0),
      lastMessage: last ? { preview: last.deleted_at ? 'Message deleted' : String(last.body).slice(0, 80), at: last.created_at, mine: last.sender_id === me } : null,
      canSend, cannotSendReason: reason,
    });
  }
  return out;
}

const LIST_SQL = `SELECT c.id, c.last_message_at, mm.status AS my_status, mm.last_read_at, tm.status AS their_status
  FROM conversations c JOIN conversation_members mm ON mm.conversation_id = c.id AND mm.user_id = $1
  LEFT JOIN conversation_members tm ON tm.conversation_id = c.id AND tm.user_id <> $1`;

export const messagesModule: ModuleDef = {
  name: 'messages',
  register(router, s) {
    router.get('/api/conversations', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>(`${LIST_SQL} WHERE mm.status <> 'declined' ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`, [c.me.userId]);
      const all = await views(s, c.me.userId, rows);
      return { items: all.filter((x) => x.status === 'accepted'), requests: all.filter((x) => x.status === 'request'), unreadTotal: all.reduce((n, x) => n + x.unread, 0) };
    });

    router.post('/api/conversations', { auth: 'active', body: z.object({ handle: z.string().trim().toLowerCase().min(3).max(30), body: text }).strict(), rate: { key: 'dm:start', limit: 15, windowMs: 3600_000 } }, async (c) => {
      const me = c.me.userId;
      const t = await c.db.get<{ id: string }>("SELECT id FROM users WHERE lower(handle) = $1 AND status = 'active'", [c.body.handle.replace(/^@/, '')]);
      if (!t || t.id === me) throw notFound('We couldn’t find that member.');
      const may = await mayStart(c.db, me, t.id);
      const key = directKey(me, t.id);
      let conv = await c.db.get<{ id: string }>('SELECT id FROM conversations WHERE direct_key = $1', [key]);
      if (!may.ok) {
        // An existing accepted conversation stays usable only if nothing blocks it; otherwise be vague.
        throw forbidden(may.reason, 'cannot_message');
      }
      const now = c.now().toISOString(); const mid = uuid();
      let cid = conv?.id;
      await c.db.tx(async (tx) => {
        if (!cid) {
          cid = uuid();
          await tx.run("INSERT INTO conversations (id, kind, direct_key, created_at, last_message_at) VALUES ($1,'direct',$2,$3,$3)", [cid, key, now]);
          await tx.run("INSERT INTO conversation_members (conversation_id, user_id, status, joined_at) VALUES ($1,$2,'accepted',$3)", [cid, me, now]);
          await tx.run('INSERT INTO conversation_members (conversation_id, user_id, status, joined_at) VALUES ($1,$2,$3,$4)', [cid, t.id, may.asRequest ? 'request' : 'accepted', now]);
        } else {
          const theirs = await tx.get<{ status: string }>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid, t.id]);
          const mine = await tx.get<{ status: string }>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid, me]);
          if (theirs?.status === 'declined' || mine?.status === 'declined') throw conflict('You can’t send more messages in this conversation.', 'cannot_message');
          if (theirs?.status === 'request') { const n = await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND sender_id = $2', [cid, me]); if (Number(n?.n) >= 1) throw conflict('Your message is waiting for them to accept.', 'awaiting_acceptance'); }
        }
        await tx.run('INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ($1,$2,$3,$4,$5)', [mid, cid, me, c.body.body, now]);
        await tx.run('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [cid, now]);
        const status = (await tx.get<{ status: string }>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid, t.id]))?.status;
        await notify(tx, { userId: t.id, type: status === 'request' ? 'message_request' : 'message', actorId: me, data: { conversationId: cid } }, c.now());
      });
      return created({ conversationId: cid, asRequest: may.asRequest });
    });

    router.get('/api/conversations/:id', { auth: 'active' }, async (c) => {
      const cid = id.safeParse(c.params.id);
      if (!cid.success) throw notFound();
      const rows = await c.db.query<any>(`${LIST_SQL} WHERE c.id = $2`, [c.me.userId, cid.data]);
      if (!rows.length) throw notFound('We couldn’t find that conversation.');
      const [conversation] = await views(s, c.me.userId, rows);
      if (!conversation) throw notFound('We couldn’t find that conversation.');
      return { conversation };
    });

    router.get('/api/conversations/:id/messages', { auth: 'active', query: z.object({ before: z.string().max(60).optional() }) }, async (c) => {
      const cid = id.safeParse(c.params.id);
      if (!cid.success) throw notFound();
      const mem = await c.db.get<any>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid.data, c.me.userId]);
      if (!mem) throw notFound('We couldn’t find that conversation.');
      const other = await c.db.get<any>('SELECT user_id, last_read_at FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2', [cid.data, c.me.userId]);
      if (other && (await relation(c.db, c.me.userId, other.user_id)).blocked) throw notFound('We couldn’t find that conversation.');
      const params: unknown[] = [cid.data]; let w = '';
      if (c.query.before) { params.push(c.query.before); w = ` AND created_at < $2`; }
      const rows = (await c.db.query<any>(`SELECT * FROM messages WHERE conversation_id = $1${w} ORDER BY created_at DESC, id DESC LIMIT 60`, params)).reverse();
      // The other person's read position is only shared if THEY allow read receipts.
      let theirRead: string | null = null;
      if (other?.last_read_at && (await loadSettings(c.db, other.user_id)).messaging.readReceipts) theirRead = other.last_read_at;
      await c.db.run('UPDATE conversation_members SET last_read_at = $3 WHERE conversation_id = $1 AND user_id = $2', [cid.data, c.me.userId, c.now().toISOString()]);
      const items: MessageView[] = rows.map((m) => ({ id: m.id, mine: m.sender_id === c.me.userId, body: m.deleted_at ? '' : m.body, at: m.created_at, deleted: !!m.deleted_at, seen: m.sender_id === c.me.userId && !!theirRead && theirRead >= m.created_at }));
      return { items, pendingRequest: mem.status === 'request' };
    });

    router.post('/api/conversations/:id/messages', { auth: 'active', body: z.object({ body: text }).strict(), rate: { key: 'dm:send', limit: 60, windowMs: 60_000 } }, async (c) => {
      const me = c.me.userId;
      const rows = await c.db.query<any>(`${LIST_SQL} WHERE c.id = $2`, [me, id.safeParse(c.params.id).data ?? '']);
      if (!rows.length) throw notFound('We couldn’t find that conversation.');
      const [v] = await views(s, me, rows);
      if (!v) throw notFound('We couldn’t find that conversation.');
      if (!v.canSend) throw conflict(v.cannotSendReason ?? 'You can’t send messages here.', 'cannot_message');
      const other = v.other.id!;
      const now = c.now().toISOString(); const mid = uuid();
      await c.db.tx(async (t) => {
        if (v.status === 'request') await t.run("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = $1 AND user_id = $2", [rows[0].id, me]); // replying accepts
        await t.run('INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ($1,$2,$3,$4,$5)', [mid, rows[0].id, me, c.body.body, now]);
        await t.run('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [rows[0].id, now]);
        await notify(t, { userId: other, type: rows[0].their_status === 'request' ? 'message_request' : 'message', actorId: me, data: { conversationId: rows[0].id } }, c.now());
      });
      return created({ message: { id: mid, mine: true, body: c.body.body, at: now, deleted: false, seen: false } satisfies MessageView });
    });

    router.post('/api/conversations/:id/accept', { auth: 'active' }, async (c) => {
      const r = await c.db.run("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = $1 AND user_id = $2 AND status IN ('request','declined')", [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });
    router.post('/api/conversations/:id/decline', { auth: 'active' }, async (c) => {
      const r = await c.db.run("UPDATE conversation_members SET status = 'declined' WHERE conversation_id = $1 AND user_id = $2 AND status IN ('request','accepted')", [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    router.delete('/api/messages/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run("UPDATE messages SET deleted_at = $3, body = '' WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL", [c.params.id, c.me.userId, c.now().toISOString()]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    registerEraser('messages', async (db, userId) => {
      // Messages stay for the other person's continuity under a neutral "Deleted account" identity (Decision 6).
      const m = await db.run('UPDATE messages SET sender_id = NULL WHERE sender_id = $1', [userId]);
      const mem = await db.run('DELETE FROM conversation_members WHERE user_id = $1', [userId]);
      await db.run("UPDATE conversations SET direct_key = NULL WHERE direct_key IS NOT NULL AND id NOT IN (SELECT conversation_id FROM conversation_members GROUP BY conversation_id HAVING COUNT(*) > 1)");
      // Conversations nobody remains in are removed entirely.
      const empty = await db.run('DELETE FROM conversations WHERE id NOT IN (SELECT conversation_id FROM conversation_members)');
      return { counts: { messages_detached: m.changes, memberships: mem.changes, conversations_removed: empty.changes } };
    });
    registerExporter('messages', async (db, userId) => db.query('SELECT m.id, m.conversation_id, m.body, m.created_at FROM messages m WHERE m.sender_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at', [userId]));
    void json;
  },
};
