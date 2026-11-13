// Founder meetings and reports. Both are the Founder's own records.
// A report is a snapshot of aggregate platform facts (nothing private, nothing a model wrote). A meeting is a plan, notes and action items.
// Neither can change governance, grant access or run an action. Anyone listed as an attendee is only listed: no agent "speaks" in a meeting.
import { z } from 'zod';
import type { ModuleDef } from './types';
import { notFound } from '../http/errors';
import { created } from '../http/router';
import { json, uuid } from '../db';
import { collectOverview } from './founder';
import { audit } from '../services/audit';
import { notify } from '../services/notify';
import type { Services } from '../services';

const id = z.string().uuid();
const short = (n: number) => z.string().trim().min(1).max(n);
const agendaItem = z.object({ id: short(40), text: short(300) }).strict();
const actionItem = z.object({ id: short(40), text: short(300), owner: z.string().trim().max(40).default('founder'), done: z.boolean().default(false), delegationId: z.string().max(60).nullable().optional() }).strict();

interface Row { label: string; value: string | number; note?: string }
interface Section { heading: string; rows: Row[]; note?: string }
export interface ReportBody { generatedAt: string; sections: Section[]; changes: { label: string; before: number; after: number }[]; basis: string }

const reportView = (r: any, full = true) => ({ id: r.id, title: r.title, createdAt: r.created_at, ...(full ? { body: json<ReportBody>(r.body, { generatedAt: r.created_at, sections: [], changes: [], basis: '' }) } : {}) });
const meetingView = (r: any) => ({ id: r.id, title: r.title, scheduledAt: r.scheduled_at, status: r.status, attendees: json<string[]>(r.attendees, []), agenda: json<any[]>(r.agenda, []), notes: r.notes, actions: json<any[]>(r.actions, []), briefing: json(r.briefing, null), createdAt: r.created_at, updatedAt: r.updated_at });

/** The facts a report or a meeting briefing is built from. Aggregate counts only. */
export async function snapshot(s: Services) {
  const o = await collectOverview(s);
  const findings = await s.db.query<any>("SELECT severity, title FROM founder_ai_findings WHERE status = 'open' ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, created_at DESC LIMIT 20");
  const pending = await s.db.query<any>("SELECT title FROM proposals WHERE status = 'pending_approval' ORDER BY created_at DESC LIMIT 20");
  const tasks = await s.db.query<any>("SELECT to_agent, status FROM ai_delegations WHERE status IN ('queued','running') ORDER BY created_at DESC LIMIT 20");
  return { o, findings, pending, tasks };
}
const flat = (o: any, key: string) => o.platform.concat(o.moderation, o.security).find((x: any) => x.key === key);

export async function buildReport(s: Services): Promise<ReportBody> {
  const { o, findings, pending, tasks } = await snapshot(s);
  const sections: Section[] = [
    { heading: 'People', rows: [...o.platform.map((m: any) => ({ label: m.label, value: m.value, note: m.note })), ...o.journey.map((j: any) => ({ label: j.label, value: j.value }))] },
    { heading: 'Safety and moderation', rows: o.moderation.map((m: any) => ({ label: m.label, value: m.value, note: m.note })) },
    { heading: 'Security and access', rows: o.security.map((m: any) => ({ label: m.label, value: m.value, note: m.note })) },
    { heading: 'Universes', rows: o.universes.map((u: any) => ({ label: u.name, value: u.status.replace(/_/g, ' '), note: u.basis })) },
    { heading: 'Waiting for you', rows: [{ label: 'Open findings', value: findings.length }, ...findings.slice(0, 5).map((f: any) => ({ label: `[${f.severity}] ${f.title}`, value: '' })), { label: 'Proposals awaiting approval', value: pending.length }, { label: 'Specialist tasks in progress', value: tasks.length }] },
  ];
  const prev = await s.db.query<any>('SELECT body FROM founder_reports ORDER BY created_at DESC LIMIT 1');
  const changes: ReportBody['changes'] = [];
  if (prev[0]) { const old = json<ReportBody>(prev[0].body, null as any); const was = new Map<string, number>(); for (const sec of old?.sections ?? []) for (const r of sec.rows) if (typeof r.value === 'number') was.set(`${sec.heading}|${r.label}`, r.value);
    for (const sec of sections) for (const r of sec.rows) { const b = was.get(`${sec.heading}|${r.label}`); if (typeof r.value === 'number' && b !== undefined && b !== r.value) changes.push({ label: `${sec.heading}: ${r.label}`, before: b, after: r.value }); } }
  return { generatedAt: s.now().toISOString(), sections, changes, basis: 'Counted from this platform’s own database at the moment shown. No private content was read and no model wrote any of it.' };
}

export const founderMeetingsModule: ModuleDef = {
  name: 'founder-meetings',
  register(router, s) {
    const P = { perm: 'ai.founder.use' } as const;
    // Product announcements. The Founder writes the words; they go to every active member who hasn't turned announcements off. Audited with the text.
    router.get('/api/founder-ai/announcements', { auth: P }, async (c) => ({ items: (await c.db.query<any>("SELECT id, occurred_at, reason, meta FROM audit_events WHERE action = 'founder_ai.announcement' ORDER BY occurred_at DESC LIMIT 20")).map((r) => ({ id: r.id, at: r.occurred_at, text: r.reason, sent: Number(json<any>(r.meta, {}).sent ?? 0) })) }));
    router.post('/api/founder-ai/announcements', { auth: P, body: z.object({ text: z.string().trim().min(5).max(280), href: z.string().regex(/^#\/[a-z0-9\-/]*$/).max(80).optional() }).strict(), rate: { key: 'fai:announce', limit: 5, windowMs: 3600_000 } }, async (c) => {
      const now = c.now(); let sent = 0;
      for (const u of await c.db.query<{ id: string }>("SELECT id FROM users WHERE status = 'active'")) if (await notify(c.db, { userId: u.id, type: 'announcement', data: { text: c.body.text, ...(c.body.href ? { href: c.body.href } : {}) } }, now)) sent++;
      const id = await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'founder_ai.announcement', targetType: 'announcement', reason: c.body.text, outcome: 'success', meta: { sent } }, now);
      return created({ id, sent });
    });
    router.get('/api/founder-ai/reports', { auth: P }, async (c) => ({ items: (await c.db.query<any>('SELECT id, title, created_at FROM founder_reports ORDER BY created_at DESC LIMIT 50')).map((r) => reportView(r, false)) }));
    router.post('/api/founder-ai/reports', { auth: P, body: z.object({ title: z.string().trim().min(3).max(120).optional() }).strict(), rate: { key: 'fai:report', limit: 20, windowMs: 3600_000 } }, async (c) => {
      const body = await buildReport(s); const rid = uuid(); const now = c.now().toISOString();
      const title = c.body.title ?? `Platform report, ${now.slice(0, 10)}`;
      await c.db.run('INSERT INTO founder_reports (id, title, body, created_by, created_at) VALUES ($1,$2,$3,$4,$5)', [rid, title, body, c.me.userId, now]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'founder_ai.report_generated', targetType: 'report', targetId: rid, outcome: 'success' }, c.now());
      return created({ report: reportView({ id: rid, title, created_at: now, body }) });
    });
    router.get('/api/founder-ai/reports/:id', { auth: P }, async (c) => { const r = (await c.db.query<any>('SELECT * FROM founder_reports WHERE id = $1', [id.safeParse(c.params.id).data ?? '']))[0]; if (!r) throw notFound(); return { report: reportView(r) }; });

    router.get('/api/founder-ai/meetings', { auth: P }, async (c) => ({ items: (await c.db.query<any>('SELECT * FROM founder_meetings ORDER BY scheduled_at DESC LIMIT 100')).map(meetingView) }));
    router.post('/api/founder-ai/meetings', { auth: P, body: z.object({ title: short(120).min(3), scheduledAt: z.string().datetime({ offset: true }), attendees: z.array(z.string().max(40)).max(12).default([]), agenda: z.array(agendaItem).max(30).default([]) }).strict(), rate: { key: 'fai:meeting', limit: 40, windowMs: 3600_000 } }, async (c) => {
      const mid = uuid(); const now = c.now().toISOString();
      await c.db.run('INSERT INTO founder_meetings (id, title, scheduled_at, attendees, agenda, created_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [mid, c.body.title, new Date(c.body.scheduledAt).toISOString(), [...new Set(c.body.attendees)], c.body.agenda, c.me.userId, now]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'founder_ai.meeting_created', targetType: 'meeting', targetId: mid, outcome: 'success' }, c.now());
      return created({ meeting: meetingView((await c.db.query<any>('SELECT * FROM founder_meetings WHERE id = $1', [mid]))[0]) });
    });
    router.patch('/api/founder-ai/meetings/:id', { auth: P, body: z.object({ title: short(120).min(3).optional(), scheduledAt: z.string().datetime({ offset: true }).optional(), status: z.enum(['scheduled', 'held', 'cancelled']).optional(), attendees: z.array(z.string().max(40)).max(12).optional(), agenda: z.array(agendaItem).max(30).optional(), notes: z.string().max(8000).optional(), actions: z.array(actionItem).max(40).optional() }).strict() }, async (c) => {
      const mid = id.safeParse(c.params.id).data ?? ''; const cur = (await c.db.query<any>('SELECT * FROM founder_meetings WHERE id = $1', [mid]))[0]; if (!cur) throw notFound();
      const b = c.body;
      await c.db.run('UPDATE founder_meetings SET title = $2, scheduled_at = $3, status = $4, attendees = $5, agenda = $6, notes = $7, actions = $8, updated_at = $9 WHERE id = $1', [mid, b.title ?? cur.title, b.scheduledAt ? new Date(b.scheduledAt).toISOString() : cur.scheduled_at, b.status ?? cur.status, b.attendees ? [...new Set(b.attendees)] : json(cur.attendees, []), b.agenda ?? json(cur.agenda, []), b.notes ?? cur.notes, b.actions ?? json(cur.actions, []), c.now().toISOString()]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'founder_ai.meeting_updated', targetType: 'meeting', targetId: mid, outcome: 'success', meta: { fields: Object.keys(b) } }, c.now());
      return { meeting: meetingView((await c.db.query<any>('SELECT * FROM founder_meetings WHERE id = $1', [mid]))[0]) };
    });
    // A briefing is a snapshot of what is waiting right now, stored with the meeting so the notes can say what was known at the time.
    router.post('/api/founder-ai/meetings/:id/briefing', { auth: P }, async (c) => {
      const mid = id.safeParse(c.params.id).data ?? ''; if (!(await c.db.query<any>('SELECT id FROM founder_meetings WHERE id = $1', [mid]))[0]) throw notFound();
      const { o, findings, pending, tasks } = await snapshot(s);
      const briefing = { at: c.now().toISOString(), items: [
        ...findings.slice(0, 6).map((f: any) => ({ kind: 'finding', text: `[${f.severity}] ${f.title}` })), ...pending.slice(0, 6).map((p: any) => ({ kind: 'approval', text: `Awaiting your approval: ${p.title}` })),
        ...tasks.slice(0, 6).map((t: any) => ({ kind: 'task', text: `Task in progress with ${t.to_agent}` })),
        ...(o.attention.suggestionsNew ? [{ kind: 'suggestion', text: `${o.attention.suggestionsNew} new citizen suggestion(s) to read` }] : []),
      ], basis: 'Read from this platform’s own records when you pressed the button. Nothing here was written by a model.' };
      await c.db.run('UPDATE founder_meetings SET briefing = $2, updated_at = $3 WHERE id = $1', [mid, briefing, c.now().toISOString()]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'founder_ai.meeting_briefed', targetType: 'meeting', targetId: mid, outcome: 'success' }, c.now());
      return { briefing };
    });
  },
};
