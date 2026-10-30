import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound } from '../http/errors';
import { created } from '../http/router';
import { uuid } from '../db';
import { loadSettings } from '../profile/common';
import { registerEraser, registerExporter } from '../services/erasure';
import type { Ctx } from '../http/router';

/**
 * Private journal, goals and habits ("Nova's tools").
 *  - Off until the person turns each one on (Settings → Nova). Turning one off hides it; erasing is a separate, explicit step.
 *  - Strictly the owner's: no route here (or anywhere) lets a moderator, governance role or the Founder read them.
 *  - Never auto-published, never sent to an AI unless the person attaches a specific journal entry to a message.
 */
const id = z.string().uuid();
type Tool = 'journalEnabled' | 'goalsEnabled' | 'habitsEnabled';

async function need(c: Ctx<any, any>, tool: Tool, label: string) {
  if (!(await loadSettings(c.db, c.me.userId)).nova[tool]) throw conflict(`Your ${label} is switched off. Turn it on in Settings → Nova to use it.`, 'tool_disabled');
}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const today = (c: Ctx<any, any>) => c.now().toISOString().slice(0, 10);
// Habit schedules are evaluated in the time zone they were set in, so "today" and "due" mean the person's own day.
const validTz = (tz: string) => { try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; } };
export function localParts(now: Date, tz: string): { date: string; weekday: number; minutes: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: validTz(tz) ? tz : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value])); const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(p.weekday));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: wd, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const habitSchedule = { days: z.array(z.number().int().min(0).max(6)).max(7).default([]), timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 18:30.').nullable().default(null), timezone: z.string().max(64).refine(validTz, 'Unknown time zone.').default('UTC'), reminder: z.boolean().default(false) };

function streak(days: string[], todayStr: string): { current: number; best: number } {
  const set = new Set(days);
  let best = 0, run = 0;
  const sorted = [...set].sort();
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && new Date(d).getTime() - new Date(prev).getTime() === 86400_000 ? run + 1 : 1;
    best = Math.max(best, run); prev = d;
  }
  let current = 0;
  let cur = new Date(todayStr);
  if (!set.has(todayStr)) cur = new Date(cur.getTime() - 86400_000); // a streak is still alive until the day ends
  while (set.has(cur.toISOString().slice(0, 10))) { current++; cur = new Date(cur.getTime() - 86400_000); }
  return { current, best };
}

export const personalToolsModule: ModuleDef = {
  name: 'personal-tools',
  register(router) {
    router.get('/api/personal', { auth: 'active' }, async (c) => {
      const st = (await loadSettings(c.db, c.me.userId)).nova;
      const n = async (t: string) => Number((await c.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = $1`, [c.me.userId]))?.n ?? 0);
      return {
        privacy: 'These tools are private to you. Moderators, governance roles and the Founder cannot read them, and nothing is shared or posted unless you do it yourself.',
        journal: { enabled: st.journalEnabled, entries: await n('journal_entries') }, goals: { enabled: st.goalsEnabled, count: await n('goals') }, habits: { enabled: st.habitsEnabled, count: await n('habits') },
      };
    });

    // ───────── journal ─────────
    router.get('/api/journal', { auth: 'active', query: z.object({ q: z.string().trim().max(60).optional() }) }, async (c) => {
      await need(c, 'journalEnabled', 'journal');
      const rows = await c.db.query<any>('SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 300', [c.me.userId]);
      const q = c.query.q?.toLowerCase();
      return { items: rows.filter((r) => !q || (r.title ?? '').toLowerCase().includes(q) || r.body.toLowerCase().includes(q)).map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at })) };
    });
    router.post('/api/journal', { auth: 'active', body: z.object({ title: z.string().trim().max(120).optional(), body: z.string().trim().min(1).max(10000) }).strict(), rate: { key: 'journal', limit: 60, windowMs: 3600_000 } }, async (c) => {
      await need(c, 'journalEnabled', 'journal');
      const jid = uuid(); const now = c.now().toISOString();
      await c.db.run('INSERT INTO journal_entries (id, user_id, title, body, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [jid, c.me.userId, c.body.title || null, c.body.body, now]);
      return created({ entry: { id: jid, title: c.body.title || null, body: c.body.body, createdAt: now, updatedAt: now } });
    });
    router.patch('/api/journal/:id', { auth: 'active', body: z.object({ title: z.string().trim().max(120).nullable().optional(), body: z.string().trim().min(1).max(10000).optional() }).strict() }, async (c) => {
      await need(c, 'journalEnabled', 'journal');
      const r = await c.db.get<any>('SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId]);
      if (!r) throw notFound();
      await c.db.run('UPDATE journal_entries SET title = $2, body = $3, updated_at = $4 WHERE id = $1', [r.id, c.body.title !== undefined ? c.body.title : r.title, c.body.body ?? r.body, c.now().toISOString()]);
      return { ok: true };
    });
    router.delete('/api/journal/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM journal_entries WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    // ───────── goals ─────────
    const goalOut = async (c: Ctx<any, any>, g: any) => ({
      id: g.id, title: g.title, description: g.description, status: g.status, targetDate: g.target_date, createdAt: g.created_at,
      steps: (await c.db.query<any>('SELECT id, title, done_at FROM goal_steps WHERE goal_id = $1 ORDER BY sort_order', [g.id])).map((s) => ({ id: s.id, title: s.title, done: !!s.done_at })),
    });
    router.get('/api/goals', { auth: 'active' }, async (c) => {
      await need(c, 'goalsEnabled', 'goals');
      const rows = await c.db.query<any>('SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [c.me.userId]);
      return { items: await Promise.all(rows.map((g) => goalOut(c, g))) };
    });
    router.post('/api/goals', { auth: 'active', body: z.object({ title: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).optional(), targetDate: day.optional(), steps: z.array(z.string().trim().min(1).max(120)).max(15).default([]) }).strict() }, async (c) => {
      await need(c, 'goalsEnabled', 'goals');
      const gid = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        await t.run('INSERT INTO goals (id, user_id, title, description, target_date, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)', [gid, c.me.userId, c.body.title, c.body.description || null, c.body.targetDate ?? null, now]);
        let i = 0; for (const st of c.body.steps) await t.run('INSERT INTO goal_steps (id, goal_id, title, sort_order) VALUES ($1,$2,$3,$4)', [uuid(), gid, st, i++]);
      });
      return created({ goal: await goalOut(c, await c.db.get('SELECT * FROM goals WHERE id = $1', [gid])) });
    });
    router.patch('/api/goals/:id', { auth: 'active', body: z.object({ title: z.string().trim().min(2).max(120).optional(), description: z.string().trim().max(1000).nullable().optional(), status: z.enum(['active', 'paused', 'done', 'dropped']).optional(), targetDate: day.nullable().optional(), addStep: z.string().trim().min(1).max(120).optional(), toggleStep: id.optional() }).strict() }, async (c) => {
      await need(c, 'goalsEnabled', 'goals');
      const g = await c.db.get<any>('SELECT * FROM goals WHERE id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId]);
      if (!g) throw notFound();
      const b = c.body; const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        await t.run('UPDATE goals SET title = $2, description = $3, status = $4, target_date = $5, updated_at = $6 WHERE id = $1', [g.id, b.title ?? g.title, b.description !== undefined ? b.description : g.description, b.status ?? g.status, b.targetDate !== undefined ? b.targetDate : g.target_date, now]);
        if (b.addStep) { const m = await t.get<{ n: number | null }>('SELECT MAX(sort_order) AS n FROM goal_steps WHERE goal_id = $1', [g.id]); await t.run('INSERT INTO goal_steps (id, goal_id, title, sort_order) VALUES ($1,$2,$3,$4)', [uuid(), g.id, b.addStep, Number(m?.n ?? -1) + 1]); }
        if (b.toggleStep) { const st = await t.get<any>('SELECT done_at FROM goal_steps WHERE id = $1 AND goal_id = $2', [b.toggleStep, g.id]); if (st) await t.run('UPDATE goal_steps SET done_at = $2 WHERE id = $1', [b.toggleStep, st.done_at ? null : now]); }
      });
      return { goal: await goalOut(c, await c.db.get('SELECT * FROM goals WHERE id = $1', [g.id])) };
    });
    router.delete('/api/goals/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM goals WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    // ───────── habits ─────────
    const habitOut = async (c: Ctx<any, any>, h: any) => {
      const days = (await c.db.query<{ day: string }>('SELECT day FROM habit_checkins WHERE habit_id = $1 ORDER BY day DESC LIMIT 400', [h.id])).map((d) => d.day);
      const tz = String(h.timezone ?? 'UTC'); const lp = localParts(c.now(), tz); const t = lp.date;
      const weekAgo = new Date(new Date(t).getTime() - 6 * 86400_000).toISOString().slice(0, 10);
      const sched: number[] = String(h.days ?? '').split(',').filter((x: string) => x !== '').map(Number); const timeOfDay: string | null = h.time_of_day ?? null;
      const scheduledToday = sched.length === 0 || sched.includes(lp.weekday); const doneToday = days.includes(t);
      const due = timeOfDay ? Number(timeOfDay.slice(0, 2)) * 60 + Number(timeOfDay.slice(3)) : 0;
      return { id: h.id, title: h.title, cadence: h.cadence, targetPerWeek: Number(h.target_per_week), archived: !!h.archived_at, doneToday, last7: days.filter((d) => d >= weekAgo).length, ...streak(days, t), recent: days.slice(0, 14),
        days: sched, timeOfDay, timezone: tz, reminder: !!h.reminder, scheduledToday,
        // "due" is evaluated on the server in the habit's own time zone. Reminders are shown inside FREEVERSE; push/email delivery is not built.
        dueNow: !!h.reminder && scheduledToday && !doneToday && lp.minutes >= due };
    };
    router.get('/api/habits', { auth: 'active' }, async (c) => {
      await need(c, 'habitsEnabled', 'habits');
      const rows = await c.db.query<any>('SELECT * FROM habits WHERE user_id = $1 AND archived_at IS NULL ORDER BY created_at LIMIT 50', [c.me.userId]);
      return { items: await Promise.all(rows.map((h) => habitOut(c, h))) };
    });
    router.post('/api/habits', { auth: 'active', body: z.object({ title: z.string().trim().min(2).max(80), cadence: z.enum(['daily', 'weekly']).default('daily'), targetPerWeek: z.number().int().min(1).max(7).default(7), ...habitSchedule }).strict() }, async (c) => {
      await need(c, 'habitsEnabled', 'habits');
      const n = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM habits WHERE user_id = $1 AND archived_at IS NULL', [c.me.userId]);
      if (Number(n?.n) >= 20) throw conflict('That is plenty of habits. Archive one before adding another.', 'quota_exceeded');
      const hid = uuid();
      await c.db.run('INSERT INTO habits (id, user_id, title, cadence, target_per_week, created_at, days, time_of_day, timezone, reminder) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [hid, c.me.userId, c.body.title, c.body.cadence, c.body.cadence === 'weekly' ? Math.min(c.body.targetPerWeek, 7) : c.body.targetPerWeek, c.now().toISOString(), [...new Set(c.body.days)].sort().join(','), c.body.timeOfDay, c.body.timezone, c.body.reminder]);
      return created({ habit: await habitOut(c, await c.db.get('SELECT * FROM habits WHERE id = $1', [hid])) });
    });
    router.patch('/api/habits/:id', { auth: 'active', body: z.object({ title: z.string().trim().min(2).max(80).optional(), days: habitSchedule.days.optional(), timeOfDay: habitSchedule.timeOfDay.optional(), timezone: habitSchedule.timezone.optional(), reminder: z.boolean().optional() }).strict() }, async (c) => {
      await need(c, 'habitsEnabled', 'habits');
      const h = await c.db.get<any>('SELECT * FROM habits WHERE id = $1 AND user_id = $2 AND archived_at IS NULL', [id.safeParse(c.params.id).data ?? '', c.me.userId]);
      if (!h) throw notFound();
      const b = c.body;
      await c.db.run('UPDATE habits SET title = $2, days = $3, time_of_day = $4, timezone = $5, reminder = $6 WHERE id = $1', [h.id, b.title ?? h.title, b.days !== undefined ? [...new Set(b.days)].sort().join(',') : h.days, b.timeOfDay !== undefined ? b.timeOfDay : h.time_of_day, b.timezone ?? h.timezone, b.reminder !== undefined ? b.reminder : !!h.reminder]);
      return { habit: await habitOut(c, await c.db.get('SELECT * FROM habits WHERE id = $1', [h.id])) };
    });
    router.post('/api/habits/:id/checkin', { auth: 'active', body: z.object({ day: day.optional(), undo: z.boolean().default(false) }).strict() }, async (c) => {
      await need(c, 'habitsEnabled', 'habits');
      const h = await c.db.get<any>('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [id.safeParse(c.params.id).data ?? '', c.me.userId]);
      if (!h) throw notFound();
      const t = localParts(c.now(), String(h.timezone ?? 'UTC')).date; const d = c.body.day ?? t;
      if (d > t) throw conflict('You can’t check in for a day that hasn’t happened yet.', 'future_day');
      if (new Date(t).getTime() - new Date(d).getTime() > 7 * 86400_000) throw conflict('You can fix check-ins up to a week back.', 'too_old');
      if (c.body.undo) await c.db.run('DELETE FROM habit_checkins WHERE habit_id = $1 AND day = $2', [h.id, d]);
      else if (!(await c.db.get('SELECT 1 AS x FROM habit_checkins WHERE habit_id = $1 AND day = $2', [h.id, d]))) await c.db.run('INSERT INTO habit_checkins (habit_id, day, created_at) VALUES ($1,$2,$3)', [h.id, d, c.now().toISOString()]);
      return { habit: await habitOut(c, h) };
    });
    router.delete('/api/habits/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('UPDATE habits SET archived_at = $3 WHERE id = $1 AND user_id = $2 AND archived_at IS NULL', [c.params.id, c.me.userId, c.now().toISOString()]);
      if (!r.changes) throw notFound();
      return { ok: true };
    });

    // ───────── explicit erase ─────────
    router.post('/api/personal/:tool/erase', { auth: 'active', body: z.object({ confirm: z.literal('ERASE') }).strict() }, async (c) => {
      const t = c.params.tool;
      let n = 0;
      if (t === 'journal') n = (await c.db.run('DELETE FROM journal_entries WHERE user_id = $1', [c.me.userId])).changes;
      else if (t === 'goals') n = (await c.db.run('DELETE FROM goals WHERE user_id = $1', [c.me.userId])).changes;
      else if (t === 'habits') n = (await c.db.run('DELETE FROM habits WHERE user_id = $1', [c.me.userId])).changes;
      else throw notFound();
      return { ok: true, erased: n };
    });

    registerEraser('personal-tools', async (db, userId) => {
      const j = await db.run('DELETE FROM journal_entries WHERE user_id = $1', [userId]);
      const g = await db.run('DELETE FROM goals WHERE user_id = $1', [userId]);
      const h = await db.run('DELETE FROM habits WHERE user_id = $1', [userId]);
      return { counts: { journal_entries: j.changes, goals: g.changes, habits: h.changes } };
    });
    registerExporter('personal-tools', async (db, userId) => ({
      journal: await db.query('SELECT title, body, created_at FROM journal_entries WHERE user_id = $1 ORDER BY created_at', [userId]),
      goals: await db.query('SELECT id, title, description, status, target_date, created_at FROM goals WHERE user_id = $1', [userId]),
      habits: await db.query('SELECT id, title, cadence, created_at FROM habits WHERE user_id = $1', [userId]),
    }));
  },
};
