import { z } from 'zod';
import type { ModuleDef } from './types';
import { notFound } from '../http/errors';
import { json, num } from '../db';
import { UNIVERSES, type UniverseStatus } from '../../shared/universes';
import { universeView } from './universes';
import { GOVERNANCE_LEVELS } from '../../shared/constants';
import { aiApi } from '../ai/runtime';
import { cfgGet } from '../governance/actions';
import { founderAiSettings } from '../governance/proposals';
import { audit } from '../services/audit';
import { TARGET_HOURS } from '../moderation/cases';
import type { Services } from '../services';

/**
 * Founder Console. Everything here is AGGREGATE or METADATA computed live from this instance's database.
 * It deliberately has no route that returns message bodies, Nova conversations, journals, private profile fields or anonymous-author identities:
 * governance rank is not access to private data.
 */
export interface Metric { key: string; label: string; value: number | string; note?: string; epistemic: 'verified_fact' }
const m = (key: string, label: string, value: number | string, note?: string): Metric => ({ key, label, value, note, epistemic: 'verified_fact' });
const count = async (s: Services, sql: string, params: unknown[] = []) => num((await s.db.get<{ n: number }>(sql, params))?.n);

export async function collectOverview(s: Services) {
  const nowIso = s.now().toISOString();
  const d7 = new Date(s.now().getTime() - 7 * 86400_000).toISOString();
  const users = await s.db.query<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM users GROUP BY status');
  const byStatus = Object.fromEntries(users.map((u) => [u.status, num(u.n)]));
  const demoUsers = await count(s, 'SELECT COUNT(*) AS n FROM users WHERE is_demo = $1', [true]);
  const platform = [
    m('members_active', 'Active members', byStatus.active ?? 0, demoUsers ? `${demoUsers} of them are fictional demo members` : undefined),
    m('members_pending', 'Awaiting eligibility check', byStatus.pending_eligibility ?? 0), m('members_suspended', 'Suspended', byStatus.suspended ?? 0), m('members_deleted', 'Deleted accounts', byStatus.deleted ?? 0),
    m('signups_7d', 'New accounts, last 7 days', await count(s, 'SELECT COUNT(*) AS n FROM users WHERE created_at > $1', [d7])),
    m('posts_7d', 'Posts, last 7 days', await count(s, "SELECT COUNT(*) AS n FROM posts WHERE created_at > $1 AND status = 'published'", [d7])),
    m('comments_7d', 'Comments, last 7 days', await count(s, "SELECT COUNT(*) AS n FROM comments WHERE created_at > $1 AND status = 'published'", [d7])),
    m('communities', 'Communities', await count(s, "SELECT COUNT(*) AS n FROM communities WHERE status = 'active'")),
  ];
  const cfg = {
    database: s.db.dialect, authProvider: s.auth.kind, authManaged: s.auth.managed, ai: s.ai.provider, storage: s.config.storage.driver, env: s.config.env,
    anonymousPosting: s.config.anonymousPostingEnabled,
    migrationsApplied: await count(s, 'SELECT COUNT(*) AS n FROM schema_migrations').catch(() => 0),
  };
  const openCases = await s.db.query<{ priority: string; n: number }>("SELECT priority, COUNT(*) AS n FROM moderation_cases WHERE status IN ('open','in_review') GROUP BY priority");
  const moderation = [
    ...['crisis', 'high', 'normal', 'low'].map((p) => m(`cases_${p}`, `Open cases · ${p}`, num(openCases.find((x) => x.priority === p)?.n))),
    m('cases_overdue', 'Past their internal target time', await count(s, "SELECT COUNT(*) AS n FROM moderation_cases WHERE status IN ('open','in_review') AND due_at < $1", [nowIso]), `Targets: crisis ${TARGET_HOURS.crisis}h, high ${TARGET_HOURS.high}h, normal ${TARGET_HOURS.normal}h. Internal goals, not promises.`),
    m('reports_30d', 'Reports, last 30 days', await count(s, 'SELECT COUNT(*) AS n FROM reports WHERE created_at > $1', [new Date(s.now().getTime() - 30 * 86400_000).toISOString()])),
    m('appeals_open', 'Open appeals', await count(s, "SELECT COUNT(*) AS n FROM appeals WHERE status = 'open'")),
    m('moderators', 'Moderators', await count(s, "SELECT COUNT(*) AS n FROM role_grants WHERE role = 'moderator' AND revoked_at IS NULL")),
    m('safety_flags_live', 'Nova safety excerpts currently kept', await count(s, 'SELECT COUNT(*) AS n FROM ai_safety_flags')),
  ];
  const seats = await s.db.query<{ level: number; holder_user_id: string | null }>('SELECT level, holder_user_id FROM governance_seats');
  const governance = GOVERNANCE_LEVELS.map((l) => ({ level: l.level, name: l.name, seats: l.seats, filled: seats.filter((x) => x.level === l.level && x.holder_user_id).length }));
  const agents = await aiApi.listAgents(s);
  const council = { provider: s.ai.provider, specialists: agents.filter((a) => !(a.config as any).hidden).map((a) => ({ id: a.id, name: a.name, state: a.state, enabled: a.enabled, available: a.available })) };
  const sec = [
    m('denied_7d', 'Denied sensitive attempts, last 7 days', await count(s, "SELECT COUNT(*) AS n FROM audit_events WHERE outcome = 'denied' AND occurred_at > $1", [d7])),
    m('stepup_fail_7d', 'Failed re-authentication, last 7 days', await count(s, "SELECT COUNT(*) AS n FROM audit_events WHERE action = 'auth.step_up' AND outcome = 'denied' AND occurred_at > $1", [d7])),
    m('grants_live', 'Live role grants', await count(s, 'SELECT COUNT(*) AS n FROM role_grants WHERE revoked_at IS NULL')),
    m('reveals_30d', 'Anonymous-author reveals, last 30 days', await count(s, "SELECT COUNT(*) AS n FROM audit_events WHERE action = 'moderation.anonymous_author_revealed' AND occurred_at > $1", [new Date(s.now().getTime() - 30 * 86400_000).toISOString()])),
  ];
  const lastReview = await s.db.get<{ completed_at: string | null }>("SELECT completed_at FROM access_reviews WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1");
  const overrides = await cfgGet<Record<string, { status: string }>>(s.db, 'universes.status', {});
  const universes = UNIVERSES.map((u) => ({ id: u.id, name: u.name, status: overrides[u.id]?.status ?? u.status, basis: u.basis }));
  const pending = await s.db.query<any>("SELECT id, title, effective_risk, source, created_at FROM proposals WHERE status = 'pending_approval' ORDER BY created_at LIMIT 20");
  const ai = await founderAiSettings(s.db);
  const timelineRows = await s.db.query<any>("SELECT a.occurred_at, a.action, a.target_type, a.outcome, u.handle FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id WHERE a.action NOT IN ('founder.console_viewed') ORDER BY a.occurred_at DESC, a.id DESC LIMIT 12");
  const attention = {
    suggestionsNew: await count(s, "SELECT COUNT(*) AS n FROM suggestions WHERE status = 'submitted'").catch(() => 0),
    findingsOpen: await count(s, "SELECT COUNT(*) AS n FROM founder_ai_findings WHERE status = 'open'").catch(() => 0),
    universesLive: universes.filter((u) => u.status === 'available' || u.status === 'partial').length, universesTotal: universes.length,
  };
  const journey = [
    { key: 'created', label: 'Created an account', value: (byStatus.active ?? 0) + (byStatus.pending_eligibility ?? 0) + (byStatus.suspended ?? 0) },
    { key: 'eligible', label: 'Passed the eligibility check', value: byStatus.active ?? 0 },
    { key: 'joined', label: 'Joined at least one community', value: await count(s, "SELECT COUNT(DISTINCT m.user_id) AS n FROM community_members m JOIN users u ON u.id = m.user_id WHERE u.status = 'active'") },
    { key: 'posted', label: 'Has posted at least once', value: await count(s, "SELECT COUNT(DISTINCT p.author_id) AS n FROM posts p JOIN users u ON u.id = p.author_id WHERE u.status = 'active' AND p.status = 'published'") },
  ];
  return {
    journey, attention, timeline: timelineRows.map((r) => ({ at: r.occurred_at, action: r.action, target: r.target_type ?? null, outcome: r.outcome ?? null, by: r.handle ?? null })),
    generatedAt: nowIso, dataNote: 'Every figure below is computed live from this instance’s own database. Nothing is estimated.',
    platform, config: cfg, moderation, governance, council, security: sec,
    accessReview: { lastCompletedAt: lastReview?.completed_at ?? null, open: await count(s, "SELECT COUNT(*) AS n FROM access_reviews WHERE status = 'open'") },
    universes, pendingDecisions: pending.map((p) => ({ id: p.id, title: p.title, risk: p.effective_risk, source: p.source, createdAt: p.created_at })),
    founderAi: { mode: ai.mode, rules: ai.rules.length },
    priorities: await cfgGet<{ id: string; text: string; done: boolean }[]>(s.db, 'founder.priorities', []),
  };
}

export const founderModule: ModuleDef = {
  name: 'founder',
  register(router, s) {
    router.get('/api/founder/overview', { auth: { perm: 'founder.console' } }, async (c) => {
      await audit(c.db, { actorId: c.me.userId, actorRole: 'founder', action: 'founder.console_viewed' }, c.now());
      return collectOverview(s);
    });

    router.get('/api/founder/communities', { auth: { perm: 'community.health.view' } }, async (c) => {
      const rows = await c.db.query<any>(
        `SELECT c.slug, c.name, c.allow_anonymous, c.is_demo, c.status, c.restricted_at, c.restricted_reason,
           (SELECT COUNT(*) FROM community_members x WHERE x.community_id = c.id) AS members,
           (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id AND p.status = 'published') AS posts,
           (SELECT COUNT(*) FROM moderation_cases k WHERE k.status IN ('open','in_review') AND k.target_type = 'post' AND k.target_id IN (SELECT CAST(id AS TEXT) FROM posts WHERE community_id = c.id)) AS open_cases
           FROM communities c WHERE c.status IN ('active','archived') ORDER BY members DESC`);
      return { items: rows.map((r) => ({ closed: r.status !== 'active', restricted: !!r.restricted_at, restrictedReason: r.restricted_reason ?? null, slug: r.slug, name: r.name, allowAnonymous: r.allow_anonymous === true || r.allow_anonymous === 1, isDemo: r.is_demo === true || r.is_demo === 1, members: num(r.members), posts: num(r.posts), openCases: num(r.open_cases) })), note: 'Counts only. No content or member lists.' };
    });

    router.get('/api/founder/audit', {
      auth: { perm: 'audit.view' },
      query: z.object({ action: z.string().max(60).optional(), actor: z.string().uuid().optional(), cursor: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
    }, async (c) => {
      const params: unknown[] = []; const w: string[] = [];
      const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
      if (c.query.action) w.push(`action LIKE ${p(`${c.query.action.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)} ESCAPE '\\'`);
      if (c.query.actor) w.push(`actor_id = ${p(c.query.actor)}`);
      if (c.query.cursor) { const [t, i] = c.query.cursor.split('|'); w.push(`(occurred_at < ${p(t)} OR (occurred_at = ${p(t)} AND id < ${p(i)}))`); }
      const rows = await c.db.query<any>(`SELECT * FROM audit_events ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY occurred_at DESC, id DESC LIMIT ${c.query.limit + 1}`, params);
      const page = rows.slice(0, c.query.limit); const last = page[page.length - 1];
      const names = new Map((await c.db.query<any>('SELECT id, handle FROM users WHERE id IN (SELECT actor_id FROM audit_events WHERE actor_id IS NOT NULL ORDER BY occurred_at DESC LIMIT 500)')).map((u) => [u.id, u.handle]));
      return {
        items: page.map((a) => ({ id: a.id, at: a.occurred_at, actor: a.actor_id ? { id: a.actor_id, handle: names.get(a.actor_id) ?? null } : null, role: a.actor_role, action: a.action, target: a.target_type ? `${a.target_type}:${String(a.target_id).slice(0, 8)}` : null, caseId: a.case_id, reason: a.reason, outcome: a.outcome, meta: json(a.meta, {}) })),
        nextCursor: rows.length > c.query.limit && last ? `${last.occurred_at}|${last.id}` : null,
        note: 'The audit log is append-only. It never stores message, post or journal content.',
      };
    });

    router.get('/api/founder/priorities', { auth: { perm: 'founder.console' } }, async (c) => ({ items: await cfgGet(c.db, 'founder.priorities', []) }));
    router.put('/api/founder/priorities', { auth: { perm: 'config.manage' }, body: z.object({ items: z.array(z.object({ id: z.string().max(40), text: z.string().trim().min(2).max(160), done: z.boolean() }).strict()).max(12) }).strict() }, async (c) => {
      await c.db.run('INSERT INTO platform_config (key, value, updated_by, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at', ['founder.priorities', c.body.items, c.me.userId, c.now().toISOString()]);
      return { items: c.body.items };
    });

    router.get('/api/founder/constitution', { auth: { perm: 'governance.view' } }, async (c) => ({
      base: { name: 'FREEVERSE Constitution', source: 'Constitution.md in the project documentation (v1.x). The text itself lives in the repository; this record tracks amendments adopted through the app.' },
      amendments: await cfgGet(c.db, 'constitution.amendments', []),
      process: 'Amendments are made by proposal: they need the Founder’s explicit approval with re-authentication, and are written to the append-only audit log.',
    }));

    router.get('/api/founder/universes', { auth: { perm: 'ops.dashboard.view' } }, async (c) => {
      const overrides = await cfgGet<Record<string, { status: string; note: string }>>(c.db, 'universes.status', {});
      return { items: UNIVERSES.map((u) => ({ id: u.id, name: u.name, builtInStatus: u.status, status: overrides[u.id]?.status ?? u.status, note: overrides[u.id]?.note ?? null, basis: u.basis })) };
    });

    // Read-only preview: builds the exact view members would get for a draft status and note. Nothing is saved.
    router.post('/api/founder/universes/preview', { auth: { perm: 'ops.dashboard.view' }, body: z.object({ universeId: z.string().max(40), status: z.enum(['available', 'partial', 'planned_v2', 'planned_v3', 'concept', 'under_review']), note: z.string().trim().max(300).default('') }).strict() }, async (c) => {
      const u = UNIVERSES.find((x) => x.id === c.body.universeId); if (!u) throw notFound('Unknown Universe.');
      const ov = await cfgGet<Record<string, { status: UniverseStatus; note?: string }>>(c.db, 'universes.status', {});
      const curStatus: UniverseStatus = ov[u.id]?.status ?? u.status; const curNote = ov[u.id]?.note ?? null;
      const now = universeView(u, curStatus, curNote); const after = universeView(u, c.body.status, c.body.note || null);
      const changes: string[] = [];
      if (now.status !== after.status) changes.push(`Members will see “${now.statusLabel}” change to “${after.statusLabel}”.`);
      if (!!now.route !== !!after.route) changes.push(after.route ? 'Members will get an Open link into this Universe.' : 'The Open link into this Universe will no longer be offered. Direct links may still work: this changes what members are told, not what is built.');
      if ((now.note ?? '') !== (after.note ?? '')) changes.push(after.note ? 'A note will be shown to members on the Universe page.' : 'The note shown to members will be removed.');
      return { before: now, after, changes, saved: false };
    });
    // Per-Universe change history from the decision record, with whether each change can still be rolled back safely.
    router.get('/api/founder/universes/:id/history', { auth: { perm: 'ops.dashboard.view' } }, async (c) => {
      const uid = String(c.params.id);
      if (!UNIVERSES.some((u) => u.id === uid)) throw notFound('Unknown Universe.');
      const rows = (await c.db.query<any>("SELECT id, status, payload, decided_by, executed_at, rollback_data, created_at FROM proposals WHERE action_type = 'universe.set_status' AND status IN ('executed','rolled_back') ORDER BY COALESCE(executed_at, created_at) DESC LIMIT 200")).filter((r) => json<any>(r.payload, {}).universeId === uid);
      const cur = (await cfgGet<Record<string, any>>(c.db, 'universes.status', {}))[uid];
      const items = rows.slice(0, 30).map((r) => { const p = json<any>(r.payload, {}); const rb = json<any>(r.rollback_data, null);
        const stillCurrent = r.status === 'executed' && !!rb && (rb.universeId ? (cur?.status ?? null) === rb.applied.status && (cur?.note ?? '') === (rb.applied.note ?? '') : true);
        return { proposalId: r.id, status: p.status, note: p.note || null, at: r.executed_at ?? r.created_at, rolledBack: r.status === 'rolled_back', canRollback: stillCurrent && !!rb?.universeId, whyNot: r.status === 'rolled_back' ? 'Already rolled back.' : !rb?.universeId ? 'Recorded before targeted rollback existed.' : !stillCurrent ? 'Changed again since.' : null }; });
      return { items };
    });

    router.get('/api/universes/overrides', { auth: 'active' }, async (c) => ({ overrides: await cfgGet(c.db, 'universes.status', {}) }));
    void notFound;
  },
};
