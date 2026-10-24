import type { ModuleDef } from './types';
import { bool } from '../db';
import { discover } from './social';
import { loadCommunities } from './communities';
import { savedSet, tagsOf } from '../catalog/common';
import { UNIVERSES } from '../../shared/universes';
import { cfgGet } from '../governance/actions';

export const exploreModule: ModuleDef = {
  name: 'explore',
  register(router, s) {
    // Explore is a set of plainly explained sections. Nothing is ranked by a hidden engagement score: each card says why it is here.
    router.get('/api/explore', { auth: 'active' }, async (c) => {
      const me = c.me.userId;
      const interests = (await c.db.query<any>("SELECT key, label FROM user_tags WHERE user_id = $1 AND kind IN ('interest','learn_topic','career','creative')", [me])).map((r) => String(r.key));
      const tokens = new Set(interests.flatMap((k) => k.split('-')).filter((x) => x.length > 2));
      const overlap = (text: string) => [...tokens].filter((t) => text.toLowerCase().includes(t));

      const comms = (await loadCommunities(c.db, me)).filter((x) => !x.viewer.member);
      const communities = comms.map((x) => ({ x, hit: overlap(`${x.name} ${x.description} ${x.category}`) })).sort((a, b) => b.hit.length - a.hit.length || b.x.memberCount - a.x.memberCount).slice(0, 6)
        .map(({ x, hit }) => ({ community: x, why: hit.length ? `Matches your interest in ${hit.slice(0, 2).join(', ')}` : 'Popular with members' }));

      const people = (await discover(s, me, { limit: 40, excludeFollowing: true })).items.sort((a, b) => b.sharedInterests.length - a.sharedInterests.length).slice(0, 8)
        .map((m) => ({ person: m, why: m.sharedInterests.length ? `Shares ${m.sharedInterests.slice(0, 2).map((x) => x.label).join(' and ')}` : 'New to FREEVERSE' }));

      const learnRows = await c.db.query<any>("SELECT id, slug, title, format, category, tags, is_demo FROM learn_items WHERE status = 'published' ORDER BY created_at DESC, title LIMIT 80");
      const sv = await savedSet(c.db, me, 'learn');
      const learn = learnRows.map((r) => ({ r, hit: overlap(`${r.title} ${r.category} ${tagsOf(r.tags).join(' ')}`) })).sort((a, b) => b.hit.length - a.hit.length).slice(0, 6)
        .map(({ r, hit }) => ({ id: r.id, slug: r.slug, title: r.title, format: r.format, category: r.category, isDemo: bool(r.is_demo), saved: sv.has(r.id), why: hit.length ? `Matches ${hit.slice(0, 2).join(', ')}` : 'Recently added' }));

      const opps = (await c.db.query<any>("SELECT id, title, organisation, type, deadline, is_demo FROM opportunities WHERE status = 'published' ORDER BY deadline IS NULL, deadline LIMIT 5")).map((r) => ({ id: r.id, title: r.title, organisation: r.organisation, type: r.type, deadline: r.deadline ?? null, isDemo: bool(r.is_demo), why: 'Closing soonest' }));
      const events = (await c.db.query<any>("SELECT id, title, starts_at, format, is_demo FROM events WHERE status = 'published' AND starts_at >= $1 ORDER BY starts_at LIMIT 5", [c.now().toISOString()])).map((r) => ({ id: r.id, title: r.title, startsAt: r.starts_at, format: r.format, isDemo: bool(r.is_demo), why: 'Coming up next' }));

      const ov = await cfgGet<Record<string, { status: string }>>(c.db, 'universes.status', {});
      const universes = UNIVERSES.filter((u) => ['available', 'partial'].includes(ov[u.id]?.status ?? u.status)).map((u) => ({ id: u.id, name: u.name, tagline: u.tagline, accent: u.accent, route: u.route ?? null }));
      return { hasInterests: interests.length > 0, communities, people, learn, opportunities: opps, events, universes, note: 'Sections are explained, not hidden-ranked. Add interests in Settings to improve the matches.' };
    });
  },
};
