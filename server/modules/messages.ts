import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { json, uuid } from '../db';
import { personCards, deletedCard } from '../services/people';
import { relation, audienceAllows } from '../policy/visibility';
import { notify } from '../services/notify';
import { loadSettings, loadPrivacy } from '../profile/common';
import { registerEraser, registerExporter } from '../services/erasure';
import { MESSAGE_LIMITS, REACTIONS, type ConversationView, type MessageView } from '../../shared/api/messages';
import { DELETE_WINDOW_MS, EXPIRY_MS } from '../../shared/api/settings';
import type { Services } from '../services';
import type { Db } from '../db';

const id = z.string().uuid();
const text = z.string().trim().min(1, 'Write a message first.').max(MESSAGE_LIMITS.bodyMax);
const directKey = (a: string, b: string) => [a, b].sort().join(':');

const sharesCommunity = async (db: Db, a: string, b: string) => !!(await db.get('SELECT 1 AS x FROM community_members x JOIN community_members y ON y.community_id = x.community_id WHERE x.user_id = $1 AND y.user_id = $2 LIMIT 1', [a, b]));

/** Can `sender` open a conversation with `target`? Returns a plain reason when not. Deliberately vague about blocks. */
async function mayStart(db: Db, sender: string, target: string): Promise<{ ok: true; asRequest: boolean; filtered: boolean } | { ok: false; reason: string }> {
  const rel = await relation(db, sender, target);
  const unavailable = { ok: false as const, reason: 'You can’t message this person.' };
  if (rel.blocked) return unavailable;
  const u = await db.get<{ status: string }>('SELECT status FROM users WHERE id = $1', [target]);
  if (!u || u.status !== 'active') return unavailable;
  const priv = await loadPrivacy(db, target);
  if (priv.who_can_message === 'nobody') return unavailable;
  if (priv.who_can_message === 'connections' && !rel.connection) return unavailable;
  // Someone the recipient doesn't follow arrives as a request, unless the recipient's settings say otherwise.
  const asRequest = !rel.followedBy; let filtered = false;
  if (asRequest) {
    const ms = (await loadSettings(db, target)).messaging;
    const from = ms.allowMessageRequests === false ? 'nobody' : ms.requestsFrom;
    if (from === 'nobody' || (from === 'followers' && !rel.following)) return unavailable;
    if (ms.requestHandling === 'filter') filtered = !(await sharesCommunity(db, sender, target));
  }
  return { ok: true, asRequest, filtered };
}

/** Should this recipient be notified about activity in this conversation? Muted and filtered conversations stay quiet, and so do requests under "Restrict". */
async function wantsNotice(db: Db, cid: string, recipient: string): Promise<boolean> {
  const m = await db.get<{ muted: unknown; filtered: unknown; status: string }>('SELECT muted, filtered, status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid, recipient]);
  if (!m || m.muted === true || m.muted === 1 || m.filtered === true || m.filtered === 1) return false;
  if (m.status === 'request' && (await loadSettings(db, recipient)).messaging.requestHandling === 'restrict') return false;
  return true;
}

const ONLINE_WINDOW_MS = 5 * 60_000;
const VIS_FOR_AUD: Record<string, string> = { members: 'members', connections: 'connections', nobody: 'only_me' };
/** What `me` is allowed to see of the other person's presence. Both settings are the other person's and are enforced here, never in the browser. */
async function presenceOf(db: Db, me: string, otherId: string, now: Date): Promise<ConversationView['presence']> {
  const rel = await relation(db, me, otherId); if (rel.blocked) return null;
  const row = await db.get<{ last_seen_at: string | null }>('SELECT last_seen_at FROM users WHERE id = $1', [otherId]); const seen = row?.last_seen_at ? new Date(row.last_seen_at).getTime() : null;
  const priv = await loadPrivacy(db, otherId); const ms = (await loadSettings(db, otherId)).messaging;
  const online = audienceAllows(priv.online_status_visibility, rel) ? (seen !== null && now.getTime() - seen < ONLINE_WINDOW_MS) : null;
  let lastActive: string | null = null;
  if (seen !== null && audienceAllows(VIS_FOR_AUD[ms.lastActiveVisibility] ?? 'only_me', rel)) { const age = now.getTime() - seen; lastActive = age < ONLINE_WINDOW_MS ? 'Active just now' : age < 86_400_000 ? 'Active today' : age < 7 * 86_400_000 ? 'Active this week' : 'Active a while ago'; }
  return { online, lastActive };
}

/** When the sender picked a default expiry, their new messages get an end time. Never applies backwards to earlier messages. */
async function expiryFor(db: Db, sender: string, now: Date): Promise<string | null> {
  const ms = (await loadSettings(db, sender)).messaging; if (ms.defaultExpiry === 'never') return null;
  return new Date(now.getTime() + EXPIRY_MS[ms.defaultExpiry]).toISOString();
}
/** A new message brings an archived conversation back to the inbox, unless the recipient chose to keep it archived. */
async function returnFromArchive(db: Db, cid: string, recipient: string) {
  if ((await loadSettings(db, recipient)).messaging.archiveBehaviour === 'return') await db.run('UPDATE conversation_members SET archived_at = NULL WHERE conversation_id = $1 AND user_id = $2 AND archived_at IS NOT NULL', [cid, recipient]);
}

async function views(s: Services, me: string, rows: any[], withPresence = false): Promise<ConversationView[]> {
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
    const nowIso = s.now().toISOString();
    const last = await s.db.get<any>('SELECT body, created_at, sender_id, deleted_at FROM messages WHERE conversation_id = $1 AND (expires_at IS NULL OR expires_at > $2) ORDER BY created_at DESC, id DESC LIMIT 1', [r.id, nowIso]);
    const unread = r.last_read_at
      ? await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > $4) AND (sender_id IS NULL OR sender_id <> $2) AND created_at > $3', [r.id, me, r.last_read_at, nowIso])
      : await s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > $3) AND (sender_id IS NULL OR sender_id <> $2)', [r.id, me, nowIso]);
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
      canSend, cannotSendReason: reason, archived: !!r.archived_at, muted: r.muted === true || r.muted === 1, filtered: r.filtered === true || r.filtered === 1,
      presence: withPresence && oid && !card.deleted ? await presenceOf(s.db, me, oid, s.now()) : null,
    });
  }
  return out;
}

const LIST_SQL = `SELECT c.id, c.last_message_at, mm.status AS my_status, mm.last_read_at, mm.archived_at, mm.muted, mm.filtered, tm.status AS their_status
  FROM conversations c JOIN conversation_members mm ON mm.conversation_id = c.id AND mm.user_id = $1
  LEFT JOIN conversation_members tm ON tm.conversation_id = c.id AND tm.user_id <> $1`;

export const messagesModule: ModuleDef = {
  name: 'messages',
  register(router, s) {
    router.get('/api/conversations', { auth: 'active' }, async (c) => {
      // Messages whose sender chose an expiry are removed once it passes. Done here, for this person's conversations, so no background job is needed.
      await c.db.run('DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= $1 AND conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $2)', [c.now().toISOString(), c.me.userId]);
      const rows = await c.db.query<any>(`${LIST_SQL} WHERE mm.status <> 'declined' ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`, [c.me.userId]);
      const all = await views(s, c.me.userId, rows);
      return {
        items: all.filter((x) => x.status === 'accepted' && !x.archived), archived: all.filter((x) => x.status === 'accepted' && x.archived),
        requests: all.filter((x) => x.status === 'request' && !x.filtered), filtered: all.filter((x) => x.status === 'request' && x.filtered),
        unreadTotal: all.filter((x) => !x.archived && !x.filtered).reduce((n, x) => n + x.unread, 0),
      };
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
          await tx.run('INSERT INTO conversation_members (conversation_id, user_id, status, joined_at, filtered) VALUES ($1,$2,$3,$4,$5)', [cid, t.id, may.asRequest ? 'request' : 'accepted', now, may.filtered]);
        } else {
          const theirs = await tx.get<{ status: string }>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid, t.id]);
          const mine = await tx.get<{ status: string }>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid, me]);
          if (theirs?.status === 'declined' || mine?.status === 'declined') throw conflict('You can’t send more messages in this conversation.', 'cannot_message');
          if (theirs?.status === 'request') { const n = await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND sender_id = $2', [cid, me]); if (Number(n?.n) >= 1) throw conflict('Your message is waiting for them to accept.', 'awaiting_acceptance'); }
        }
        await tx.run('INSERT INTO messages (id, conversation_id, sender_id, body, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)', [mid, cid, me, c.body.body, now, await expiryFor(tx, me, c.now())]);
        await tx.run('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [cid, now]);
        await returnFromArchive(tx, cid!, t.id);
        const status = (await tx.get<{ status: string }>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid, t.id]))?.status;
        if (await wantsNotice(tx, cid!, t.id)) await notify(tx, { userId: t.id, type: status === 'request' ? 'message_request' : 'message', actorId: me, data: { conversationId: cid } }, c.now());
      });
      return created({ conversationId: cid, asRequest: may.asRequest });
    });

    router.get('/api/conversations/:id', { auth: 'active' }, async (c) => {
      const cid = id.safeParse(c.params.id);
      if (!cid.success) throw notFound();
      const rows = await c.db.query<any>(`${LIST_SQL} WHERE c.id = $2`, [c.me.userId, cid.data]);
      if (!rows.length) throw notFound('We couldn’t find that conversation.');
      const [conversation] = await views(s, c.me.userId, rows, true);
      if (!conversation) throw notFound('We couldn’t find that conversation.');
      return { conversation };
    });

    router.get('/api/conversations/:id/messages', { auth: 'active', query: z.object({ before: z.string().max(60).optional() }) }, async (c) => {
      const cid = id.safeParse(c.params.id);
      if (!cid.success) throw notFound();
      const mem = await c.db.get<any>('SELECT status FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [cid.data, c.me.userId]);
      if (!mem) throw notFound('We couldn’t find that conversation.');
      const other = await c.db.get<any>('SELECT user_id, last_read_at, status FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2', [cid.data, c.me.userId]);
      if (other && (await relation(c.db, c.me.userId, other.user_id)).blocked) throw notFound('We couldn’t find that conversation.');
      const nowIso = c.now().toISOString(); const me = c.me.userId;
      await c.db.run('DELETE FROM messages WHERE conversation_id = $1 AND expires_at IS NOT NULL AND expires_at <= $2', [cid.data, nowIso]);
      const params: unknown[] = [cid.data]; let w = '';
      if (c.query.before) { params.push(c.query.before); w = ` AND created_at < $2`; }
      const rows = (await c.db.query<any>(`SELECT * FROM messages WHERE conversation_id = $1${w} ORDER BY created_at DESC, id DESC LIMIT 60`, params)).reverse();
      // The other person's read position is only shared if THEY allow read receipts, and never while their settings restrict requests.
      let theirRead: string | null = null;
      if (other?.last_read_at && other.status === 'accepted' && (await loadSettings(c.db, other.user_id)).messaging.readReceipts) theirRead = other.last_read_at;
      await c.db.run('UPDATE conversation_members SET last_read_at = $3 WHERE conversation_id = $1 AND user_id = $2', [cid.data, me, nowIso]);
      const ids = rows.map((m) => m.id);
      const reacts = ids.length ? await c.db.query<{ message_id: string; user_id: string; emoji: string }>(`SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids) : [];
      const byId = new Map(rows.map((m) => [m.id, m])); const win = (await loadSettings(c.db, me)).messaging.deleteWindow;
      const items: MessageView[] = rows.map((m) => {
        const mine = m.sender_id === me; const rep = m.reply_to_id ? byId.get(m.reply_to_id) ?? null : null;
        const mr = reacts.filter((r) => r.message_id === m.id); const kinds = REACTIONS.map((x) => x.id).filter((id) => mr.some((r) => r.emoji === id));
        return { id: m.id, mine, body: m.deleted_at ? '' : m.body, at: m.created_at, deleted: !!m.deleted_at, seen: mine && !!theirRead && theirRead >= m.created_at,
          replyTo: m.reply_to_id ? { id: m.reply_to_id, preview: !rep || rep.deleted_at ? 'Message no longer available' : String(rep.body).slice(0, 80), mine: !!rep && rep.sender_id === me } : null,
          reactions: kinds.map((emoji) => ({ emoji, count: mr.filter((r) => r.emoji === emoji).length, mine: mr.some((r) => r.emoji === emoji && r.user_id === me) })),
          expiresAt: m.expires_at ?? null, canDelete: mine && !m.deleted_at && (win === 'anytime' || c.now().getTime() - new Date(m.created_at).getTime() <= DELETE_WINDOW_MS[win]) };
      });
      return { items, pendingRequest: mem.status === 'request' };
    });

    router.post('/api/conversations/:id/messages', { auth: 'active', body: z.object({ body: text, replyTo: z.string().uuid().optional() }).strict(), rate: { key: 'dm:send', limit: 60, windowMs: 60_000 } }, async (c) => {
      const me = c.me.userId;
      const rows = await c.db.query<any>(`${LIST_SQL} WHERE c.id = $2`, [me, id.safeParse(c.params.id).data ?? '']);
      if (!rows.length) throw notFound('We couldn’t find that conversation.');
      const [v] = await views(s, me, rows);
      if (!v) throw notFound('We couldn’t find that conversation.');
      if (!v.canSend) throw conflict(v.cannotSendReason ?? 'You can’t send messages here.', 'cannot_message');
      const other = v.other.id!;
      const now = c.now().toISOString(); const mid = uuid();
      if (c.body.replyTo) {
        const target = await c.db.get<{ sender_id: string | null; deleted_at: string | null }>('SELECT sender_id, deleted_at FROM messages WHERE id = $1 AND conversation_id = $2', [c.body.replyTo, rows[0].id]);
        if (!target || target.deleted_at) throw notFound('That message is no longer available to reply to.');
        if (target.sender_id && target.sender_id !== me && !(await loadSettings(c.db, target.sender_id)).messaging.allowReplies) throw conflict('This person doesn’t allow replies or quotes of their messages.', 'replies_off');
      }
      await c.db.tx(async (t) => {
        if (v.status === 'request') await t.run("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = $1 AND user_id = $2", [rows[0].id, me]); // replying accepts
        await t.run('INSERT INTO messages (id, conversation_id, sender_id, body, created_at, reply_to_id, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [mid, rows[0].id, me, c.body.body, now, c.body.replyTo ?? null, await expiryFor(t, me, c.now())]);
        await t.run('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [rows[0].id, now]);
        await returnFromArchive(t, rows[0].id, other);
        if (await wantsNotice(t, rows[0].id, other)) await notify(t, { userId: other, type: rows[0].their_status === 'request' ? 'message_request' : 'message', actorId: me, data: { conversationId: rows[0].id } }, c.now());
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
      const m = await c.db.get<{ created_at: string }>('SELECT created_at FROM messages WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL', [c.params.id, c.me.userId]);
      if (!m) throw notFound();
      const win = (await loadSettings(c.db, c.me.userId)).messaging.deleteWindow;
      if (win !== 'anytime' && c.now().getTime() - new Date(m.created_at).getTime() > DELETE_WINDOW_MS[win]) throw conflict(`You chose to keep your messages after ${win === '1h' ? 'an hour' : 'a day'}. You can change that in Settings, then Messaging.`, 'delete_window_passed');
      await c.db.run("UPDATE messages SET deleted_at = $2, body = '' WHERE id = $1", [c.params.id, c.now().toISOString()]);
      return { ok: true };
    });

    // One reaction per person per message. Whether someone may react to a message is its author's choice.
    router.put('/api/messages/:id/reaction', { auth: 'active', body: z.object({ emoji: z.enum(REACTIONS.map((r) => r.id) as [string, ...string[]]).nullable() }).strict(), rate: { key: 'dm:react', limit: 120, windowMs: 60_000 } }, async (c) => {
      const me = c.me.userId; const m = await c.db.get<{ id: string; conversation_id: string; sender_id: string | null; deleted_at: string | null }>('SELECT id, conversation_id, sender_id, deleted_at FROM messages WHERE id = $1', [id.safeParse(c.params.id).data ?? '']);
      if (!m || m.deleted_at) throw notFound('That message is no longer available.');
      const mem = await c.db.get('SELECT 1 AS x FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND status <> $3', [m.conversation_id, me, 'declined']); if (!mem) throw notFound('That message is no longer available.');
      if (m.sender_id && m.sender_id !== me) {
        if ((await relation(c.db, me, m.sender_id)).blocked) throw notFound('That message is no longer available.');
        if (c.body.emoji && !(await loadSettings(c.db, m.sender_id)).messaging.allowReactions) throw conflict('This person doesn’t allow reactions to their messages.', 'reactions_off');
      }
      await c.db.run('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [m.id, me]);
      if (c.body.emoji) {
        await c.db.run('INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES ($1,$2,$3,$4)', [m.id, me, c.body.emoji, c.now().toISOString()]);
        if (m.sender_id && m.sender_id !== me && (await wantsNotice(c.db, m.conversation_id, m.sender_id))) await notify(c.db, { userId: m.sender_id, type: 'reaction', actorId: me, data: { kind: c.body.emoji, conversationId: m.conversation_id, href: `#/messages/${m.conversation_id}` } }, c.now());
      }
      return { ok: true };
    });

    router.post('/api/conversations/:id/archive', { auth: 'active', body: z.object({ archived: z.boolean() }).strict() }, async (c) => {
      const r = await c.db.run('UPDATE conversation_members SET archived_at = $3 WHERE conversation_id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId, c.body.archived ? c.now().toISOString() : null]);
      if (!r.changes) throw notFound(); return { ok: true };
    });
    router.post('/api/conversations/:id/mute', { auth: 'active', body: z.object({ muted: z.boolean() }).strict() }, async (c) => {
      const r = await c.db.run('UPDATE conversation_members SET muted = $3 WHERE conversation_id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId, c.body.muted]);
      if (!r.changes) throw notFound(); return { ok: true };
    });
    // Moving a filtered request into the normal list is the recipient's call.
    router.post('/api/conversations/:id/unfilter', { auth: 'active' }, async (c) => {
      const r = await c.db.run('UPDATE conversation_members SET filtered = $3 WHERE conversation_id = $1 AND user_id = $2 AND filtered = $4', [id.safeParse(c.params.id).data ?? '', c.me.userId, false, true]);
      if (!r.changes) throw notFound(); return { ok: true };
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
    registerExporter('messages', async (db, userId) => db.query('SELECT m.id, m.conversation_id, m.body, m.created_at FROM messages m WHERE m.sender_id = $1 AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > $2) ORDER BY m.created_at', [userId, new Date().toISOString()]));
    void json;
  },
};
