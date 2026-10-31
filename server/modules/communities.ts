import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { bool, contains, json, uuid } from '../db';
import { slugify } from '../../shared/interests';
import { audit } from '../services/audit';
import { registerEraser, registerExporter } from '../services/erasure';
import type { CommunityView } from '../../shared/api/content';
import type { Services } from '../services';
import type { Db } from '../db';

const settingsPatch = z.object({ joinPolicy: z.enum(['open', 'approval']).optional(), postPolicy: z.enum(['members', 'moderators']).optional(), commentPolicy: z.enum(['members', 'moderators']).optional(), allowLinks: z.boolean().optional(), discoverable: z.boolean().optional(), pinnedNote: z.string().trim().max(400).nullable().optional() }).strict();
const slugParam = z.string().regex(/^[a-z0-9-]{2,48}$/);

export async function loadCommunities(db: Db, viewerId: string, where = '', params: unknown[] = [], limit = 100, order = 'ORDER BY member_count DESC, c.name'): Promise<CommunityView[]> {
  const rows = await db.query<any>(
    `SELECT c.*, (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count,
            (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id AND p.status = 'published') AS post_count,
            (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id AND p.status = 'published' AND p.created_at >= $${params.length + 2}) AS posts30d,
            cm.role AS my_role, cm.show_on_profile AS my_show,
            (SELECT r.status FROM community_join_requests r WHERE r.community_id = c.id AND r.user_id = $1) AS my_request
       FROM communities c LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = $1
      WHERE c.status = 'active' ${where} ${order} LIMIT ${limit}`, [viewerId, ...params, new Date(Date.now() - 30 * 86400_000).toISOString()]);
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, description: r.description, category: r.category, accent: r.accent ?? null,
    allowAnonymous: bool(r.allow_anonymous), rules: json<string[]>(r.rules, []), isDemo: bool(r.is_demo),
    memberCount: Number(r.member_count), postCount: Number(r.post_count),
    viewer: { member: !!r.my_role, role: (r.my_role as 'member' | 'moderator' | null) ?? null, showOnProfile: r.my_role ? bool(r.my_show) : true, joinRequest: r.my_request === 'pending' ? 'pending' : null },
    posts30d: Number(r.posts30d),
    settings: { joinPolicy: r.join_policy === 'approval' ? 'approval' : 'open', postPolicy: r.post_policy === 'moderators' ? 'moderators' : 'members', commentPolicy: r.comment_policy === 'moderators' ? 'moderators' : 'members', allowLinks: bool(r.allow_links), discoverable: bool(r.discoverable), pinnedNote: r.pinned_note ?? null },
  }));
}

const DEMO_COMMUNITIES: { slug: string; name: string; description: string; category: string; anon: boolean; accent: string; rules: string[] }[] = [
  { slug: 'welcome-lounge', name: 'Welcome Lounge', description: 'Say hello, introduce yourself and find your feet. Newcomers always welcome.', category: 'Community', anon: true, accent: '#7C5CFF', rules: ['Be kind and curious.', 'No spam or self-promotion floods.', 'Respect other people’s privacy.'] },
  { slug: 'study-circle', name: 'Study Circle', description: 'Study tips, exam prep, accountability and peer help across subjects.', category: 'Education', anon: true, accent: '#16A394', rules: ['Share what helped you.', 'Credit sources.', 'No cheating services.'] },
  { slug: 'code-and-build', name: 'Code & Build', description: 'Developers and tinkerers swapping projects, bugs and lessons.', category: 'Technology', anon: true, accent: '#2F6BFF', rules: ['Show your work, ask specific questions.', 'Be generous with feedback.'] },
  { slug: 'creators-corner', name: 'Creators’ Corner', description: 'Art, music, writing, film and everything made by hand or heart.', category: 'Creative', anon: true, accent: '#F2644B', rules: ['Give feedback you would want to receive.', 'Only share work you made or have rights to.'] },
  { slug: 'first-job-club', name: 'First Job Club', description: 'CVs, interviews, internships and the messy first steps of a career.', category: 'Career', anon: false, accent: '#E3A008', rules: ['No fake listings.', 'Share what you learned.'] },
  { slug: 'money-basics', name: 'Money Basics', description: 'Budgeting, saving and financial literacy without the jargon.', category: 'Finance', anon: true, accent: '#16A34A', rules: ['Education, not personalised financial advice.', 'No get-rich-quick schemes.'] },
  { slug: 'honest-questions', name: 'Honest Questions', description: 'Ask the things you’d rather not put your name to. Anonymous posting is allowed here — kindness is not optional.', category: 'Support', anon: true, accent: '#8B5CF6', rules: ['Be kind: anonymity is for honesty, not cruelty.', 'No targeting of individuals.', 'Moderators can review reports; see the privacy notes before posting.'] },
  { slug: 'wellbeing-corner', name: 'Wellbeing Corner', description: 'Everyday wellbeing, stress and balance. A peer space, not a substitute for professional help. Anonymous posting is allowed.', category: 'Wellbeing', anon: true, accent: '#0EA5A4', rules: ['Peers, not professionals: no diagnosing.', 'If you are in crisis, use the support links in the app.', 'Be gentle.'] },
  { slug: 'gamers-guild', name: 'Gamers’ Guild', description: 'Games, game design, squads and good-natured banter.', category: 'Gaming', anon: true, accent: '#EC4899', rules: ['Good sportsmanship.', 'No harassment, ever.'] },
  { slug: 'volunteer-hub', name: 'Volunteer Hub', description: 'Find causes, organise drives and celebrate community impact.', category: 'Volunteering', anon: false, accent: '#F97316', rules: ['Verify organisations before sharing.', 'Celebrate the helpers.'] },
];

export const communitiesModule: ModuleDef = {
  name: 'communities',
  async seed(s: Services) {
    if (!s.config.seedDemoData) return;
    const nowIso = s.now().toISOString();
    for (const c of DEMO_COMMUNITIES) {
      if (await s.db.get('SELECT 1 AS x FROM communities WHERE slug = $1', [c.slug])) continue;
      await s.db.run('INSERT INTO communities (id, slug, name, description, category, allow_anonymous, rules, accent, is_demo, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [uuid(), c.slug, c.name, c.description, c.category, c.anon && s.config.anonymousPostingEnabled, c.rules, c.accent, true, nowIso]);
    }
  },
  register(router, s) {
    router.get('/api/communities', {
      auth: 'active',
      query: z.object({
        q: z.string().max(60).optional(), category: z.string().max(40).optional(), joined: z.enum(['1']).optional(),
        // Extensible discovery filters: each is optional and independent.
        sort: z.enum(['members', 'active', 'new']).default('members'), anonymous: z.enum(['1']).optional(), open: z.enum(['1']).optional(), active: z.enum(['1']).optional(), size: z.enum(['small', 'medium', 'large']).optional(),
      }),
    }, async (c) => {
      const where: string[] = []; const params: unknown[] = [];
      if (c.query.q) { params.push(contains(c.query.q)); where.push(`AND (lower(c.name) LIKE $${params.length + 1} ESCAPE '\\' OR lower(c.description) LIKE $${params.length + 1} ESCAPE '\\')`); }
      if (c.query.category) { params.push(c.query.category); where.push(`AND c.category = $${params.length + 1}`); }
      if (c.query.joined) where.push('AND cm.user_id IS NOT NULL');
      // Unlisted communities never appear in discovery, but their members still see them under "Joined".
      where.push('AND (c.discoverable = $' + (params.push(true) + 1) + ' OR cm.user_id IS NOT NULL)');
      if (c.query.anonymous) where.push('AND c.allow_anonymous = $' + (params.push(true) + 1));
      if (c.query.open) where.push("AND c.join_policy = 'open'");
      let items = await loadCommunities(c.db, c.me.userId, where.join(' '), params, 200, c.query.sort === 'new' ? 'ORDER BY c.created_at DESC' : 'ORDER BY member_count DESC, c.name');
      if (c.query.active) items = items.filter((i) => i.posts30d >= 3);
      if (c.query.size) items = items.filter((i) => (c.query.size === 'small' ? i.memberCount < 20 : c.query.size === 'medium' ? i.memberCount >= 20 && i.memberCount < 100 : i.memberCount >= 100));
      if (c.query.sort === 'active') items = [...items].sort((x, y) => y.posts30d - x.posts30d || y.memberCount - x.memberCount);
      const cats = await c.db.query<{ category: string }>("SELECT DISTINCT category FROM communities WHERE status = 'active' AND discoverable = $1 ORDER BY category", [true]);
      return { items, categories: cats.map((x) => x.category) };
    });

    router.get('/api/communities/:slug', { auth: 'active' }, async (c) => {
      const slug = slugParam.safeParse(c.params.slug);
      if (!slug.success) throw notFound('We couldn’t find that community.');
      const [item] = await loadCommunities(c.db, c.me.userId, 'AND c.slug = $2', [slug.data], 1);
      if (!item) throw notFound('We couldn’t find that community.');
      // Health indicators are counted from real activity in the last 30 days. Moderators also see their own queues.
      const since = new Date(Date.now() - 30 * 86400_000).toISOString(); const n = async (sql: string, ...p: unknown[]) => Number((await c.db.get<{ n: number }>(sql, p))?.n ?? 0);
      const isMod = item.viewer.role === 'moderator' || c.can('moderation.queue.view');
      item.health = {
        posts30d: item.posts30d,
        comments30d: await n("SELECT COUNT(*) AS n FROM comments m JOIN posts p ON p.id = m.post_id WHERE p.community_id = $1 AND m.status = 'published' AND m.created_at >= $2", item.id, since),
        activePosters30d: await n("SELECT COUNT(DISTINCT p.author_id) AS n FROM posts p WHERE p.community_id = $1 AND p.status = 'published' AND p.created_at >= $2", item.id, since),
        newMembers30d: await n('SELECT COUNT(*) AS n FROM community_members WHERE community_id = $1 AND joined_at >= $2', item.id, since),
        memberCount: item.memberCount,
        openReports: isMod ? await n("SELECT COUNT(*) AS n FROM reports r JOIN posts p ON r.target_type = 'post' AND r.target_id = CAST(p.id AS TEXT) WHERE p.community_id = $1 AND r.status IN ('received','under_review')", item.id) : null,
        pendingJoinRequests: isMod ? await n("SELECT COUNT(*) AS n FROM community_join_requests WHERE community_id = $1 AND status = 'pending'", item.id) : null,
        basis: 'Counted from real posts, comments and memberships in the last 30 days. Anonymous posts count toward totals without revealing anyone.',
      };
      return { community: item };
    });

    router.post('/api/communities', {
      auth: 'active',
      body: z.object({ name: z.string().trim().min(3).max(48), description: z.string().trim().min(10).max(400), category: z.string().trim().min(2).max(30), rules: z.array(z.string().trim().min(3).max(160)).max(8).default([]), settings: settingsPatch.optional() }).strict(),
      rate: { key: 'community:create', limit: 3, windowMs: 24 * 3600_000 },
    }, async (c) => {
      const slug = slugify(c.body.name);
      if (slug.length < 2 || !slugParam.safeParse(slug).success) throw conflict('Choose a name with letters or numbers.', 'invalid_name');
      if (await c.db.get('SELECT 1 AS x FROM communities WHERE slug = $1', [slug])) throw conflict('A community with a very similar name already exists.', 'name_taken');
      const id = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        // Anonymous posting is available by default in new communities (when the global switch is on). The community's moderators can turn it off.
        const st = c.body.settings ?? {};
        await t.run('INSERT INTO communities (id, slug, name, description, category, allow_anonymous, rules, is_demo, created_at, join_policy, post_policy, comment_policy, allow_links, discoverable, pinned_note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
          [id, slug, c.body.name, c.body.description, c.body.category, s.config.anonymousPostingEnabled, c.body.rules, false, now, st.joinPolicy ?? 'open', st.postPolicy ?? 'members', st.commentPolicy ?? 'members', st.allowLinks ?? true, st.discoverable ?? true, st.pinnedNote ?? null, c.me.userId]);
        await t.run("INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES ($1,$2,'moderator',$3)", [id, c.me.userId, now]);
      });
      const [item] = await loadCommunities(c.db, c.me.userId, 'AND c.id = $2', [id], 1);
      return created({ community: item });
    });

    router.post('/api/communities/:slug/anonymous', { auth: 'active', body: z.object({ allow: z.boolean(), reason: z.string().trim().min(5).max(300) }).strict() }, async (c) => {
      const row = await c.db.get<{ id: string }>('SELECT id FROM communities WHERE slug = $1', [c.params.slug]);
      if (!row) throw notFound();
      // Platform config managers may switch it either way. A community's own moderators may only switch it OFF for their community.
      if (!c.can('config.manage')) {
        const mod = await c.db.get('SELECT 1 AS x FROM community_members WHERE community_id = $1 AND user_id = $2 AND role = \'moderator\'', [row.id, c.me.userId]);
        if (!mod || c.body.allow) throw forbidden('Only platform stewards can turn anonymous posting on; community moderators can turn it off.', 'permission_denied');
      }
      if (c.body.allow && !s.config.anonymousPostingEnabled) throw conflict('Anonymous posting is switched off for this deployment.', 'anonymous_disabled');
      await c.db.run('UPDATE communities SET allow_anonymous = $2 WHERE id = $1', [row.id, c.body.allow]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'config', action: 'community.anonymous_changed', targetType: 'community', targetId: row.id, reason: c.body.reason, meta: { allow: c.body.allow } }, c.now());
      return { ok: true };
    });

    router.post('/api/communities/:slug/join', { auth: 'active' }, async (c) => {
      const com = await c.db.get<{ id: string; join_policy: string }>("SELECT id, join_policy FROM communities WHERE slug = $1 AND status = 'active'", [c.params.slug]);
      if (!com) throw notFound('We couldn’t find that community.');
      if (await c.db.get('SELECT 1 AS x FROM community_members WHERE community_id = $1 AND user_id = $2', [com.id, c.me.userId])) return { ok: true, status: 'member' };
      const now = c.now().toISOString();
      if (com.join_policy === 'approval') {
        // The community's moderators decide. A person who was declined can ask again only after a moderator reopens it (no repeat requests).
        const prior = await c.db.get<{ status: string }>('SELECT status FROM community_join_requests WHERE community_id = $1 AND user_id = $2', [com.id, c.me.userId]);
        if (prior?.status === 'declined') throw forbidden('Your request to join was not approved.', 'join_declined');
        if (!prior) await c.db.run("INSERT INTO community_join_requests (community_id, user_id, status, created_at) VALUES ($1,$2,'pending',$3)", [com.id, c.me.userId, now]);
        else await c.db.run("UPDATE community_join_requests SET status = 'pending', created_at = $3, decided_by = NULL, decided_at = NULL WHERE community_id = $1 AND user_id = $2", [com.id, c.me.userId, now]);
        return { ok: true, status: 'pending' };
      }
      await c.db.run("INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES ($1,$2,'member',$3)", [com.id, c.me.userId, now]);
      return { ok: true, status: 'member' };
    });

    const modOf = async (c: any, slug: string) => {
      const com = await c.db.get("SELECT id, name FROM communities WHERE slug = $1 AND status = 'active'", [slug]);
      if (!com) throw notFound('We couldn’t find that community.');
      const mod = await c.db.get("SELECT 1 AS x FROM community_members WHERE community_id = $1 AND user_id = $2 AND role = 'moderator'", [com.id, c.me.userId]);
      if (!mod && !c.can('config.manage')) throw forbidden('Only this community’s moderators can do that.', 'permission_denied');
      return com as { id: string; name: string };
    };
    // Settings: rules, discovery, who joins, who posts and comments, whether links are allowed, and a pinned note.
    router.patch('/api/communities/:slug/settings', { auth: 'active', body: z.object({
      description: z.string().trim().min(10).max(400).optional(), rules: z.array(z.string().trim().min(3).max(160)).max(8).optional(), category: z.string().trim().min(2).max(30).optional(), settings: settingsPatch.optional(),
    }).strict() }, async (c) => {
      const com = await modOf(c, String(c.params.slug)); const b = c.body; const st = b.settings ?? {};
      const cur = await c.db.get<any>('SELECT * FROM communities WHERE id = $1', [com.id]);
      await c.db.run('UPDATE communities SET description = $2, rules = $3, category = $4, join_policy = $5, post_policy = $6, comment_policy = $7, allow_links = $8, discoverable = $9, pinned_note = $10 WHERE id = $1', [
        com.id, b.description ?? cur.description, b.rules ?? json<string[]>(cur.rules, []), b.category ?? cur.category, st.joinPolicy ?? cur.join_policy, st.postPolicy ?? cur.post_policy, st.commentPolicy ?? cur.comment_policy,
        st.allowLinks ?? bool(cur.allow_links), st.discoverable ?? bool(cur.discoverable), st.pinnedNote !== undefined ? st.pinnedNote : cur.pinned_note]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'community_moderator', action: 'community.settings_changed', targetType: 'community', targetId: com.id, meta: { fields: [...Object.keys(b).filter((k) => k !== 'settings'), ...Object.keys(st)] } }, c.now());
      const [item] = await loadCommunities(c.db, c.me.userId, 'AND c.id = $2', [com.id], 1);
      return { community: item };
    });
    router.get('/api/communities/:slug/requests', { auth: 'active' }, async (c) => {
      const com = await modOf(c, String(c.params.slug));
      const rows = await c.db.query<any>("SELECT r.user_id, r.created_at, u.handle, u.display_name FROM community_join_requests r JOIN users u ON u.id = r.user_id WHERE r.community_id = $1 AND r.status = 'pending' AND u.status = 'active' ORDER BY r.created_at", [com.id]);
      return { items: rows.map((r) => ({ userId: r.user_id, handle: r.handle, displayName: r.display_name ?? 'Member', requestedAt: r.created_at })) };
    });
    router.post('/api/communities/:slug/requests/:userId', { auth: 'active', body: z.object({ decision: z.enum(['approve', 'decline']) }).strict() }, async (c) => {
      const com = await modOf(c, String(c.params.slug)); const now = c.now().toISOString();
      const req = await c.db.get<any>("SELECT 1 AS x FROM community_join_requests WHERE community_id = $1 AND user_id = $2 AND status = 'pending'", [com.id, c.params.userId]);
      if (!req) throw notFound('That request is no longer pending.');
      await c.db.tx(async (t) => {
        await t.run('UPDATE community_join_requests SET status = $3, decided_by = $4, decided_at = $5 WHERE community_id = $1 AND user_id = $2', [com.id, c.params.userId, c.body.decision === 'approve' ? 'approved' : 'declined', c.me.userId, now]);
        if (c.body.decision === 'approve') await t.run("INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES ($1,$2,'member',$3) ON CONFLICT (community_id, user_id) DO NOTHING", [com.id, c.params.userId, now]);
      });
      return { ok: true };
    });

    router.delete('/api/communities/:slug/join', { auth: 'active' }, async (c) => {
      const com = await c.db.get<{ id: string }>('SELECT id FROM communities WHERE slug = $1', [c.params.slug]);
      if (!com) throw notFound('We couldn’t find that community.');
      await c.db.run('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [com.id, c.me.userId]);
      await c.db.run("DELETE FROM community_join_requests WHERE community_id = $1 AND user_id = $2 AND status = 'pending'", [com.id, c.me.userId]); // also withdraws a pending request
      return { ok: true };
    });

    router.patch('/api/communities/:slug/membership', { auth: 'active', body: z.object({ showOnProfile: z.boolean() }).strict() }, async (c) => {
      const com = await c.db.get<{ id: string }>('SELECT id FROM communities WHERE slug = $1', [c.params.slug]);
      if (!com) throw notFound();
      const r = await c.db.run('UPDATE community_members SET show_on_profile = $3 WHERE community_id = $1 AND user_id = $2', [com.id, c.me.userId, c.body.showOnProfile]);
      if (!r.changes) throw forbidden('Join the community first.', 'not_a_member');
      return { ok: true };
    });

    registerEraser('communities', async (db, userId) => {
      await db.run('DELETE FROM community_join_requests WHERE user_id = $1', [userId]);
      const r = await db.run('DELETE FROM community_members WHERE user_id = $1', [userId]);
      return { counts: { community_memberships: r.changes } };
    });
    registerExporter('communities', async (db, userId) => db.query('SELECT c.slug, c.name, m.role, m.joined_at FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.user_id = $1', [userId]));
  },
};
