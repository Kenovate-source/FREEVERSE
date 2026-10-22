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

const slugParam = z.string().regex(/^[a-z0-9-]{2,48}$/);

export async function loadCommunities(db: Db, viewerId: string, where = '', params: unknown[] = [], limit = 100): Promise<CommunityView[]> {
  const rows = await db.query<any>(
    `SELECT c.*, (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count,
            (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id AND p.status = 'published') AS post_count,
            cm.role AS my_role, cm.show_on_profile AS my_show
       FROM communities c LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = $1
      WHERE c.status = 'active' ${where} ORDER BY member_count DESC, c.name LIMIT ${limit}`, [viewerId, ...params]);
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, description: r.description, category: r.category, accent: r.accent ?? null,
    allowAnonymous: bool(r.allow_anonymous), rules: json<string[]>(r.rules, []), isDemo: bool(r.is_demo),
    memberCount: Number(r.member_count), postCount: Number(r.post_count),
    viewer: { member: !!r.my_role, role: (r.my_role as 'member' | 'moderator' | null) ?? null, showOnProfile: r.my_role ? bool(r.my_show) : true },
  }));
}

const DEMO_COMMUNITIES: { slug: string; name: string; description: string; category: string; anon: boolean; accent: string; rules: string[] }[] = [
  { slug: 'welcome-lounge', name: 'Welcome Lounge', description: 'Say hello, introduce yourself and find your feet. Newcomers always welcome.', category: 'Community', anon: false, accent: '#7C5CFF', rules: ['Be kind and curious.', 'No spam or self-promotion floods.', 'Respect other people’s privacy.'] },
  { slug: 'study-circle', name: 'Study Circle', description: 'Study tips, exam prep, accountability and peer help across subjects.', category: 'Education', anon: false, accent: '#16A394', rules: ['Share what helped you.', 'Credit sources.', 'No cheating services.'] },
  { slug: 'code-and-build', name: 'Code & Build', description: 'Developers and tinkerers swapping projects, bugs and lessons.', category: 'Technology', anon: false, accent: '#2F6BFF', rules: ['Show your work, ask specific questions.', 'Be generous with feedback.'] },
  { slug: 'creators-corner', name: 'Creators’ Corner', description: 'Art, music, writing, film and everything made by hand or heart.', category: 'Creative', anon: false, accent: '#F2644B', rules: ['Give feedback you would want to receive.', 'Only share work you made or have rights to.'] },
  { slug: 'first-job-club', name: 'First Job Club', description: 'CVs, interviews, internships and the messy first steps of a career.', category: 'Career', anon: false, accent: '#E3A008', rules: ['No fake listings.', 'Share what you learned.'] },
  { slug: 'money-basics', name: 'Money Basics', description: 'Budgeting, saving and financial literacy without the jargon.', category: 'Finance', anon: false, accent: '#16A34A', rules: ['Education, not personalised financial advice.', 'No get-rich-quick schemes.'] },
  { slug: 'honest-questions', name: 'Honest Questions', description: 'Ask the things you’d rather not put your name to. Anonymous posting is allowed here — kindness is not optional.', category: 'Support', anon: true, accent: '#8B5CF6', rules: ['Be kind: anonymity is for honesty, not cruelty.', 'No targeting of individuals.', 'Moderators can review reports; see the privacy notes before posting.'] },
  { slug: 'wellbeing-corner', name: 'Wellbeing Corner', description: 'Everyday wellbeing, stress and balance. A peer space, not a substitute for professional help. Anonymous posting is allowed.', category: 'Wellbeing', anon: true, accent: '#0EA5A4', rules: ['Peers, not professionals: no diagnosing.', 'If you are in crisis, use the support links in the app.', 'Be gentle.'] },
  { slug: 'gamers-guild', name: 'Gamers’ Guild', description: 'Games, game design, squads and good-natured banter.', category: 'Gaming', anon: false, accent: '#EC4899', rules: ['Good sportsmanship.', 'No harassment, ever.'] },
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
      query: z.object({ q: z.string().max(60).optional(), category: z.string().max(40).optional(), joined: z.enum(['1']).optional() }),
    }, async (c) => {
      const where: string[] = []; const params: unknown[] = [];
      if (c.query.q) { params.push(contains(c.query.q)); where.push(`AND (lower(c.name) LIKE $${params.length + 1} ESCAPE '\\' OR lower(c.description) LIKE $${params.length + 1} ESCAPE '\\')`); }
      if (c.query.category) { params.push(c.query.category); where.push(`AND c.category = $${params.length + 1}`); }
      if (c.query.joined) where.push('AND cm.user_id IS NOT NULL');
      const items = await loadCommunities(c.db, c.me.userId, where.join(' '), params);
      const cats = await c.db.query<{ category: string }>("SELECT DISTINCT category FROM communities WHERE status = 'active' ORDER BY category");
      return { items, categories: cats.map((x) => x.category) };
    });

    router.get('/api/communities/:slug', { auth: 'active' }, async (c) => {
      const slug = slugParam.safeParse(c.params.slug);
      if (!slug.success) throw notFound('We couldn’t find that community.');
      const [item] = await loadCommunities(c.db, c.me.userId, 'AND c.slug = $2', [slug.data], 1);
      if (!item) throw notFound('We couldn’t find that community.');
      return { community: item };
    });

    router.post('/api/communities', {
      auth: 'active',
      body: z.object({ name: z.string().trim().min(3).max(48), description: z.string().trim().min(10).max(400), category: z.string().trim().min(2).max(30), rules: z.array(z.string().trim().min(3).max(160)).max(8).default([]) }).strict(),
      rate: { key: 'community:create', limit: 3, windowMs: 24 * 3600_000 },
    }, async (c) => {
      const slug = slugify(c.body.name);
      if (slug.length < 2 || !slugParam.safeParse(slug).success) throw conflict('Choose a name with letters or numbers.', 'invalid_name');
      if (await c.db.get('SELECT 1 AS x FROM communities WHERE slug = $1', [slug])) throw conflict('A community with a very similar name already exists.', 'name_taken');
      const id = uuid(); const now = c.now().toISOString();
      await c.db.tx(async (t) => {
        // Anonymous posting is never enabled by creators: it needs an explicit decision by someone with config.manage.
        await t.run('INSERT INTO communities (id, slug, name, description, category, allow_anonymous, rules, is_demo, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [id, slug, c.body.name, c.body.description, c.body.category, false, c.body.rules, false, now]);
        await t.run("INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES ($1,$2,'moderator',$3)", [id, c.me.userId, now]);
      });
      const [item] = await loadCommunities(c.db, c.me.userId, 'AND c.id = $2', [id], 1);
      return created({ community: item });
    });

    router.post('/api/communities/:slug/anonymous', { auth: { perm: 'config.manage' }, body: z.object({ allow: z.boolean(), reason: z.string().trim().min(5).max(300) }).strict() }, async (c) => {
      const row = await c.db.get<{ id: string }>('SELECT id FROM communities WHERE slug = $1', [c.params.slug]);
      if (!row) throw notFound();
      if (c.body.allow && !s.config.anonymousPostingEnabled) throw conflict('Anonymous posting is switched off for this deployment.', 'anonymous_disabled');
      await c.db.run('UPDATE communities SET allow_anonymous = $2 WHERE id = $1', [row.id, c.body.allow]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'config', action: 'community.anonymous_changed', targetType: 'community', targetId: row.id, reason: c.body.reason, meta: { allow: c.body.allow } }, c.now());
      return { ok: true };
    });

    router.post('/api/communities/:slug/join', { auth: 'active' }, async (c) => {
      const com = await c.db.get<{ id: string }>("SELECT id FROM communities WHERE slug = $1 AND status = 'active'", [c.params.slug]);
      if (!com) throw notFound('We couldn’t find that community.');
      if (!(await c.db.get('SELECT 1 AS x FROM community_members WHERE community_id = $1 AND user_id = $2', [com.id, c.me.userId])))
        await c.db.run("INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES ($1,$2,'member',$3)", [com.id, c.me.userId, c.now().toISOString()]);
      return { ok: true };
    });

    router.delete('/api/communities/:slug/join', { auth: 'active' }, async (c) => {
      const com = await c.db.get<{ id: string }>('SELECT id FROM communities WHERE slug = $1', [c.params.slug]);
      if (!com) throw notFound('We couldn’t find that community.');
      await c.db.run('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [com.id, c.me.userId]);
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
      const r = await db.run('DELETE FROM community_members WHERE user_id = $1', [userId]);
      return { counts: { community_memberships: r.changes } };
    });
    registerExporter('communities', async (db, userId) => db.query('SELECT c.slug, c.name, m.role, m.joined_at FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.user_id = $1', [userId]));
  },
};
