import type { Db } from '../db';
import { json } from '../db';
import type { Services } from './index';
import { notify } from './notify';
import { ARCHETYPE_DEFS } from '../../shared/archetypes';
import { evaluate, userStats } from '../identity/stats';
import { myIdentities } from '../modules/identities';
import { purgeOldConversations } from '../modules/nova';

const DAY = 86_400_000;
/** Returns true the first time a one-off notice key is seen for a person, false afterwards. */
async function firstTime(db: Db, userId: string, key: string, now: Date): Promise<boolean> {
  const r = await db.run('INSERT INTO notice_log (user_id, notice_key, created_at) VALUES ($1,$2,$3) ON CONFLICT (user_id, notice_key) DO NOTHING', [userId, key, now.toISOString()]);
  return r.changes > 0;
}

/** Tells someone about achievements they have newly earned. Each is announced once. Called after actions that can earn one. */
export async function checkAchievements(db: Db, now: Date, userId: string): Promise<number> {
  const st = await userStats(db, userId); let n = 0;
  for (const i of await myIdentities(db, userId)) for (const a of ARCHETYPE_DEFS[i.archetype].achievements) {
    const e = evaluate(a, st, i.archetype);
    if (e.earned && (await firstTime(db, userId, `achievement:${e.id}`, now))) { await notify(db, { userId, type: 'achievement', data: { text: `You earned “${e.label}”.`, href: '#/identities' } }, now); n++; }
  }
  await checkNewAchievable(db, now, userId);
  return n;
}

/**
 * Tells someone when new achievements become available to them (a new definition, or a new identity). The first time we look at a person we only record
 * what already exists, so nobody is told about things that were always there. New ones are announced in a single notice.
 */
export async function checkNewAchievable(db: Db, now: Date, userId: string): Promise<number> {
  const all: { id: string; label: string }[] = [];
  for (const i of await myIdentities(db, userId)) for (const a of ARCHETYPE_DEFS[i.archetype].achievements) all.push({ id: `${i.archetype}:${a.id}`, label: a.label });
  if (!all.length) return 0; // nothing to look at yet: the first identity becomes the quiet baseline
  const seeded = !(await firstTime(db, userId, 'avail-baseline', now));
  const fresh: { id: string; label: string }[] = [];
  for (const a of all) if (await firstTime(db, userId, `avail:${a.id}`, now)) fresh.push(a);
  if (!seeded || !fresh.length) return 0;
  const names = fresh.slice(0, 3).map((a) => `“${a.label}”`).join(', ');
  await notify(db, { userId, type: 'achievement_new', data: { text: fresh.length === 1 ? `A new achievement you can work toward: ${names}.` : `${fresh.length} new achievements you can work toward, including ${names}.`, href: '#/identities' } }, now);
  return fresh.length;
}

/** Notices for finishing a learning item. */
export async function learningDone(db: Db, now: Date, userId: string, itemId: string, title: string): Promise<void> {
  if (await firstTime(db, userId, `learning:${itemId}`, now)) await notify(db, { userId, type: 'learning', data: { text: `You finished “${title}”.`, href: '#/learn' } }, now);
}

/** Scheduled: reminders for events starting within a day, deadline notices, Nova history cleanup notices, and expired disappearing messages. Idempotent. */
let lastAchievableSweep = 0;
export async function runAlerts(s: Services): Promise<{ events: number; deadlines: number; novaCleanups: number; messagesPurged: number; newAchievable: number }> {
  const now = s.now(); const nowIso = now.toISOString(); let events = 0; let deadlines = 0; let novaCleanups = 0;
  const soon = new Date(now.getTime() + DAY).toISOString();
  for (const r of await s.db.query<any>(`SELECT r.user_id, e.id, e.title, e.starts_at FROM event_rsvps r JOIN events e ON e.id = r.event_id WHERE r.response IN ('yes','maybe') AND e.status = 'published' AND e.starts_at > $1 AND e.starts_at <= $2`, [nowIso, soon])) {
    if (await firstTime(s.db, r.user_id, `event:${r.id}:${String(r.starts_at).slice(0, 16)}`, now)) { if (await notify(s.db, { userId: r.user_id, type: 'event_reminder', data: { text: `“${r.title}” starts within a day.`, href: '#/events' } }, now)) events++; }
  }
  const horizon = now.getTime() + 3 * DAY;
  for (const r of await s.db.query<any>(`SELECT t.user_id, o.id, o.title, o.deadline FROM opportunity_tracking t JOIN opportunities o ON o.id = t.opportunity_id WHERE t.status = 'interested' AND o.status = 'published' AND o.deadline IS NOT NULL`)) {
    const d = Date.parse(r.deadline); if (!Number.isFinite(d) || d < now.getTime() || d > horizon) continue;
    if (await firstTime(s.db, r.user_id, `deadline:${r.id}:${String(r.deadline).slice(0, 10)}`, now)) { if (await notify(s.db, { userId: r.user_id, type: 'opportunity_deadline', data: { text: `“${r.title}” closes on ${String(r.deadline).slice(0, 10)}. You marked it as interested.`, href: '#/opportunities' } }, now)) deadlines++; }
  }
  // Nova history: people who chose automatic cleanup get it on schedule, and are told when something was removed.
  for (const r of await s.db.query<any>('SELECT user_id, nova FROM user_settings')) {
    if (!json<any>(r.nova, {}).historyRetentionDays) continue;
    const gone = await purgeOldConversations(s.db, r.user_id, now);
    if (gone > 0) { await notify(s.db, { userId: r.user_id, type: 'ai_activity', data: { text: `Nova removed ${gone} saved conversation${gone === 1 ? '' : 's'} older than the cleanup time you chose.`, href: '#/settings/nova' } }, now); novaCleanups++; }
  }
  // Disappearing messages are removed for everyone when they expire, not only when someone opens the conversation.
  const messagesPurged = (await s.db.run('DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= $1', [nowIso])).changes;
  // New achievements can appear whenever definitions change, so look hourly across active members.
  let newAchievable = 0;
  if (now.getTime() - lastAchievableSweep >= 3600_000) {
    lastAchievableSweep = now.getTime();
    for (const u of await s.db.query<{ id: string }>("SELECT id FROM users WHERE status = 'active'")) { await checkAchievements(s.db, now, u.id); newAchievable += await checkNewAchievable(s.db, now, u.id); }
  }
  return { events, deadlines, novaCleanups, messagesPurged, newAchievable };
}
