import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { uuid } from '../db';
import { audit } from '../services/audit';
import { notify } from '../services/notify';
import { personCards } from '../services/people';
import { registerEraser, registerExporter } from '../services/erasure';
import { screenLabel } from '../../shared/label-screen';
import { UNIVERSE_IDS } from '../../shared/universes';
import { PROJECT_STATUSES, type ProjectCard, type ProjectDetail, type MyProjectState } from '../../shared/api/projects';

const MAX_OWNED = 5; const MAX_UPDATE = 1000;
const universe = z.enum(UNIVERSE_IDS as unknown as [string, ...string[]]);
const fields = { title: z.string().trim().min(3).max(80), summary: z.string().trim().min(10).max(280), details: z.string().trim().max(2000).nullable().optional(), lookingFor: z.string().trim().max(120).nullable().optional(), maxMembers: z.number().int().min(2).max(12).optional() };
const screen = (o: Record<string, string | null | undefined>) => { for (const [k, v] of Object.entries(o)) { const bad = v ? screenLabel(v) : null; if (bad) throw badRequest(bad, { [k]: 'label_not_allowed' }, 'label_not_allowed'); } };

export const projectsModule: ModuleDef = {
  name: 'projects',
  register(router, s) {
    const person = (cards: Map<string, any>, id: string) => { const p = cards.get(id); return { handle: p && !p.deleted && !p.restricted ? p.handle : null, displayName: p?.restricted ? 'Unavailable member' : p?.displayName ?? 'Deleted account' }; };
    /** A block in either direction hides the project from the other person and stops joining. */
    const blockedWith = async (db: typeof s.db, a: string, b: string) => !!(await db.get('SELECT 1 AS x FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [a, b]));
    const isId = (v: string) => z.string().uuid().safeParse(v).success;
    const load = async (db: typeof s.db, pid: string) => !isId(pid) ? undefined : db.get<any>('SELECT * FROM projects WHERE id = $1', [pid]);
    const myState = async (db: typeof s.db, p: any, me: string): Promise<MyProjectState> => {
      if (p.owner_id === me) return 'owner';
      const m = await db.get<any>('SELECT state FROM project_members WHERE project_id = $1 AND user_id = $2', [p.id, me]); return m ? (m.state === 'active' ? 'member' : m.state === 'pending' ? 'pending' : null) : null;
    };
    const cards = async (me: string, rows: any[]): Promise<ProjectCard[]> => {
      const pc = await personCards(s, me, rows.map((r) => r.owner_id)); const out: ProjectCard[] = [];
      for (const r of rows) {
        const n = await s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_members WHERE project_id = $1 AND state = 'active'", [r.id]);
        out.push({ id: r.id, universeId: r.universe_id, title: r.title, summary: r.summary, lookingFor: r.looking_for ?? null, status: r.status, members: 1 + Number(n?.n ?? 0), maxMembers: Number(r.max_members), owner: person(pc, r.owner_id), mine: await myState(s.db, r, me), createdAt: r.created_at });
      }
      return out;
    };
    const visible = (r: any) => !r.hidden_reason;
    const pid = (c: { params: Record<string, string | undefined> }) => c.params.id ?? ''; const uid = (c: { params: Record<string, string | undefined> }) => (isId(c.params.userId ?? '') ? (c.params.userId as string) : '00000000-0000-0000-0000-000000000000');

    router.get('/api/universes/:universe/projects', { auth: 'active', query: z.object({ status: z.enum(PROJECT_STATUSES).optional(), q: z.string().trim().max(80).optional(), mine: z.enum(['1']).optional() }) }, async (c) => {
      const u = universe.safeParse(c.params.universe); if (!u.success) throw notFound('We couldn’t find that Universe.');
      const st = c.query.status;
      const rows = await c.db.query<any>(`SELECT p.* FROM projects p WHERE p.universe_id = $1 AND p.hidden_reason IS NULL ${st ? 'AND p.status = $3' : ''} AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = p.owner_id) OR (b.blocker_id = p.owner_id AND b.blocked_id = $2)) ORDER BY p.created_at DESC LIMIT 100`, st ? [u.data, c.me.userId, st] : [u.data, c.me.userId]);
      let items = await cards(c.me.userId, rows.filter((r) => r.status !== 'archived' || c.query.status === 'archived'));
      const q = c.query.q?.toLowerCase(); if (q) items = items.filter((p) => `${p.title} ${p.summary} ${p.lookingFor ?? ''}`.toLowerCase().includes(q));
      if (c.query.mine) items = items.filter((p) => p.mine);
      return { items };
    });

    router.post('/api/universes/:universe/projects', { auth: 'active', body: z.object({ ...fields, status: z.enum(['open', 'in_progress']).default('open') }).strict(), rate: { key: 'project-create', limit: 10, windowMs: 3600_000 } }, async (c) => {
      const u = universe.safeParse(c.params.universe); if (!u.success) throw notFound('We couldn’t find that Universe.');
      const b = c.body; screen({ title: b.title, summary: b.summary, details: b.details, lookingFor: b.lookingFor });
      const owned = await c.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM projects WHERE owner_id = $1 AND status <> 'archived' AND status <> 'completed'", [c.me.userId]);
      if (Number(owned?.n ?? 0) >= MAX_OWNED) throw conflict(`You can run up to ${MAX_OWNED} projects at once. Complete or archive one first.`, 'too_many_projects');
      const id = uuid(); const now = c.now().toISOString();
      await c.db.run('INSERT INTO projects (id, universe_id, owner_id, title, summary, details, looking_for, status, max_members, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)', [id, u.data, c.me.userId, b.title, b.summary, b.details ?? null, b.lookingFor ?? null, b.status, b.maxMembers ?? 8, now]);
      return created({ id });
    });

    router.get('/api/projects/:id', { auth: 'active' }, async (c) => {
      const p = await load(c.db, pid(c)); const canMod = c.me.permissions.has('moderation.case.act');
      if (!p || (!visible(p) && p.owner_id !== c.me.userId && !canMod) || (await blockedWith(c.db, c.me.userId, p.owner_id))) throw notFound('We couldn’t find that project.');
      const card = (await cards(c.me.userId, [p]))[0]!; const owner = card.mine === 'owner';
      const members = await c.db.query<any>('SELECT user_id, state, message, created_at FROM project_members WHERE project_id = $1 ORDER BY created_at', [p.id]);
      const ups = await c.db.query<any>('SELECT id, author_id, body, created_at FROM project_updates WHERE project_id = $1 ORDER BY created_at DESC LIMIT 30', [p.id]);
      const pc = await personCards(s, c.me.userId, [p.owner_id, ...members.map((m) => m.user_id), ...ups.map((u) => u.author_id)]);
      const detail: ProjectDetail = {
        ...card, details: p.details ?? null,
        team: [{ userId: p.owner_id, ...person(pc, p.owner_id), role: 'owner' as const }, ...members.filter((m) => m.state === 'active' && !pc.get(m.user_id)?.restricted).map((m) => ({ userId: m.user_id, ...person(pc, m.user_id), role: 'member' as const }))],
        requests: owner ? members.filter((m) => m.state === 'pending').map((m) => ({ userId: m.user_id, ...person(pc, m.user_id), message: m.message ?? null, at: m.created_at })) : [],
        updates: ups.filter((u) => !pc.get(u.author_id)?.restricted).map((u) => ({ id: u.id, body: u.body, at: u.created_at, author: person(pc, u.author_id) })),
        canModerate: canMod,
      };
      return { project: detail, hidden: p.hidden_reason ?? null };
    });

    router.patch('/api/projects/:id', { auth: 'active', body: z.object({ title: fields.title.optional(), summary: fields.summary.optional(), details: fields.details, lookingFor: fields.lookingFor, maxMembers: fields.maxMembers, status: z.enum(PROJECT_STATUSES).optional() }).strict() }, async (c) => {
      const p = await load(c.db, pid(c)); if (!p || p.owner_id !== c.me.userId) throw notFound('We couldn’t find that project.');
      const b = c.body; screen({ title: b.title, summary: b.summary, details: b.details, lookingFor: b.lookingFor });
      if (b.maxMembers !== undefined) { const n = await c.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_members WHERE project_id = $1 AND state = 'active'", [p.id]); if (b.maxMembers < 1 + Number(n?.n ?? 0)) throw conflict('That’s fewer than the people already on the team.', 'below_team_size'); }
      await c.db.run('UPDATE projects SET title = $2, summary = $3, details = $4, looking_for = $5, max_members = $6, status = $7, updated_at = $8 WHERE id = $1', [p.id, b.title ?? p.title, b.summary ?? p.summary, b.details !== undefined ? b.details : p.details, b.lookingFor !== undefined ? b.lookingFor : p.looking_for, b.maxMembers ?? p.max_members, b.status ?? p.status, c.now().toISOString()]);
      if (b.status && b.status !== p.status && (b.status === 'completed' || b.status === 'archived')) {
        if (b.status === 'archived') await c.db.run("DELETE FROM project_members WHERE project_id = $1 AND state = 'pending'", [p.id]);
        for (const m of await c.db.query<any>("SELECT user_id FROM project_members WHERE project_id = $1 AND state = 'active'", [p.id])) await notify(c.db, { userId: m.user_id, type: 'project', actorId: c.me.userId, data: { text: `“${p.title}” is now ${b.status === 'completed' ? 'marked completed' : 'archived'}.`, href: `#/projects/${p.id}` } }, c.now());
      }
      return { ok: true };
    });

    router.delete('/api/projects/:id', { auth: 'active' }, async (c) => {
      const p = await load(c.db, pid(c)); if (!p || p.owner_id !== c.me.userId) throw notFound('We couldn’t find that project.');
      for (const m of await c.db.query<any>("SELECT user_id FROM project_members WHERE project_id = $1 AND state = 'active'", [p.id])) await notify(c.db, { userId: m.user_id, type: 'project', actorId: c.me.userId, data: { text: `“${p.title}” was deleted by its owner.` } }, c.now());
      await c.db.run('DELETE FROM projects WHERE id = $1', [p.id]); return { ok: true };
    });

    // ───────── joining ─────────
    router.post('/api/projects/:id/join', { auth: 'active', body: z.object({ message: z.string().trim().max(300).optional() }).strict(), rate: { key: 'project-join', limit: 20, windowMs: 3600_000 } }, async (c) => {
      const p = await load(c.db, pid(c));
      if (!p || !visible(p) || (await blockedWith(c.db, c.me.userId, p.owner_id))) throw notFound('We couldn’t find that project.');
      if (p.owner_id === c.me.userId) throw conflict('You own this project.', 'own_project');
      if (p.status !== 'open' && p.status !== 'in_progress') throw conflict('This project isn’t taking new people.', 'not_open');
      screen({ message: c.body.message });
      const have = await c.db.get<any>('SELECT state FROM project_members WHERE project_id = $1 AND user_id = $2', [p.id, c.me.userId]);
      if (have) throw conflict(have.state === 'active' ? 'You’re already on this team.' : 'You’ve already asked to join.', 'already_joined');
      const n = await c.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_members WHERE project_id = $1 AND state = 'active'", [p.id]);
      if (1 + Number(n?.n ?? 0) >= Number(p.max_members)) throw conflict('This team is full.', 'project_full');
      await c.db.run("INSERT INTO project_members (project_id, user_id, state, message, created_at) VALUES ($1,$2,'pending',$3,$4)", [p.id, c.me.userId, c.body.message ?? null, c.now().toISOString()]);
      await notify(c.db, { userId: p.owner_id, type: 'project', actorId: c.me.userId, data: { text: `Someone asked to join “${p.title}”.`, href: `#/projects/${p.id}` } }, c.now());
      return created({ ok: true, state: 'pending' });
    });
    router.post('/api/projects/:id/requests/:userId', { auth: 'active', body: z.object({ decision: z.enum(['accept', 'decline']) }).strict() }, async (c) => {
      const p = await load(c.db, pid(c)); if (!p || p.owner_id !== c.me.userId) throw notFound('We couldn’t find that project.');
      const m = await c.db.get<any>("SELECT 1 AS x FROM project_members WHERE project_id = $1 AND user_id = $2 AND state = 'pending'", [p.id, uid(c)]); if (!m) throw notFound('That request is no longer waiting.');
      const accept = c.body.decision === 'accept';
      if (accept) { const n = await c.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_members WHERE project_id = $1 AND state = 'active'", [p.id]); if (1 + Number(n?.n ?? 0) >= Number(p.max_members)) throw conflict('Your team is full. Raise the limit or decline.', 'project_full'); }
      if (accept) await c.db.run("UPDATE project_members SET state = 'active', decided_at = $3 WHERE project_id = $1 AND user_id = $2", [p.id, uid(c), c.now().toISOString()]);
      else await c.db.run('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [p.id, uid(c)]);
      await notify(c.db, { userId: uid(c), type: 'project', actorId: c.me.userId, data: { text: accept ? `You’re on the team for “${p.title}”.` : `“${p.title}” can’t take you on right now.`, href: accept ? `#/projects/${p.id}` : undefined } }, c.now());
      return { ok: true };
    });
    // Leave, withdraw a request, or (owner) remove someone.
    router.delete('/api/projects/:id/members/:userId', { auth: 'active' }, async (c) => {
      const p = await load(c.db, pid(c)); if (!p) throw notFound('We couldn’t find that project.');
      const self = uid(c) === c.me.userId;
      if (!self && p.owner_id !== c.me.userId) throw forbidden('Only the owner can remove someone.');
      if (self && p.owner_id === c.me.userId) throw conflict('The owner can’t leave. Archive or delete the project instead.', 'owner_cannot_leave');
      const r = await c.db.run('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [p.id, uid(c)]); if (!r.changes) throw notFound('They’re not on this project.');
      if (!self) await notify(c.db, { userId: uid(c), type: 'project', actorId: c.me.userId, data: { text: `You were removed from “${p.title}”.` } }, c.now());
      return { ok: true };
    });

    // ───────── updates ─────────
    router.post('/api/projects/:id/updates', { auth: 'active', body: z.object({ body: z.string().trim().min(2).max(MAX_UPDATE) }).strict(), rate: { key: 'project-update', limit: 30, windowMs: 3600_000 } }, async (c) => {
      const p = await load(c.db, pid(c)); if (!p || !visible(p)) throw notFound('We couldn’t find that project.');
      const st = await myState(c.db, p, c.me.userId); if (st !== 'owner' && st !== 'member') throw forbidden('Only the team can post updates.');
      if (p.status === 'archived') throw conflict('This project is archived.', 'archived');
      screen({ body: c.body.body });
      const id = uuid(); await c.db.run('INSERT INTO project_updates (id, project_id, author_id, body, created_at) VALUES ($1,$2,$3,$4,$5)', [id, p.id, c.me.userId, c.body.body, c.now().toISOString()]);
      const team = (await c.db.query<any>("SELECT user_id FROM project_members WHERE project_id = $1 AND state = 'active'", [p.id])).map((m) => m.user_id).concat(p.owner_id).filter((u: string) => u !== c.me.userId);
      for (const u of team) await notify(c.db, { userId: u, type: 'project', actorId: c.me.userId, data: { text: `New update on “${p.title}”.`, href: `#/projects/${p.id}` } }, c.now());
      return created({ id });
    });

    // ───────── moderation ─────────
    router.post('/api/projects/:id/hide', { auth: { perm: 'moderation.case.act' }, body: z.object({ hide: z.boolean(), note: z.string().trim().min(5).max(500) }).strict() }, async (c) => {
      const p = await load(c.db, pid(c)); if (!p) throw notFound('We couldn’t find that project.');
      await c.db.run('UPDATE projects SET hidden_reason = $2 WHERE id = $1', [p.id, c.body.hide ? c.body.note : null]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'moderator', action: c.body.hide ? 'project.hidden' : 'project.restored', targetType: 'project', targetId: p.id, reason: c.body.note, outcome: 'success' }, c.now());
      if (c.body.hide) await notify(c.db, { userId: p.owner_id, type: 'moderation', data: { action: 'remove_content', category: 'project' } }, c.now());
      return { ok: true };
    });

    router.get('/api/me/projects', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>("SELECT p.* FROM projects p WHERE p.hidden_reason IS NULL AND p.status <> 'archived' AND (p.owner_id = $1 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $1)) ORDER BY p.updated_at DESC LIMIT 50", [c.me.userId]);
      return { items: await cards(c.me.userId, rows) };
    });

    registerEraser('projects', async (db, userId) => ({ counts: { projects_owned: (await db.run('DELETE FROM projects WHERE owner_id = $1', [userId])).changes, memberships: (await db.run('DELETE FROM project_members WHERE user_id = $1', [userId])).changes, updates: (await db.run('DELETE FROM project_updates WHERE author_id = $1', [userId])).changes } }));
    registerExporter('projects', async (db, userId) => ({ owned: await db.query('SELECT universe_id, title, summary, details, looking_for, status, created_at FROM projects WHERE owner_id = $1', [userId]), memberships: await db.query('SELECT project_id, state, message, created_at FROM project_members WHERE user_id = $1', [userId]), updates: await db.query('SELECT project_id, body, created_at FROM project_updates WHERE author_id = $1', [userId]) }));
  },
};
