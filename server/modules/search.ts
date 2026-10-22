import { z } from 'zod';
import type { ModuleDef } from './types';
import { bool } from '../db';
import { discover } from './social';
import { sqlPostVisible } from '../policy/visibility';
import { likeTerm } from '../catalog/common';
import { UNIVERSES } from '../../shared/universes';
import type { SearchHit, SearchResponse } from '../../shared/api/catalog';

const PAGES: { title: string; href: string; words: string }[] = [
  { title: 'Home', href: '#/home', words: 'home feed dashboard' }, { title: 'Explore', href: '#/explore', words: 'explore discover' }, { title: 'Learn', href: '#/learn', words: 'learn courses tutorials' },
  { title: 'Opportunities', href: '#/opportunities', words: 'jobs internships scholarships grants' }, { title: 'Mentors', href: '#/mentors', words: 'mentor mentoring' }, { title: 'Events', href: '#/events', words: 'events workshops meetups' },
  { title: 'Communities', href: '#/communities', words: 'communities groups' }, { title: 'Messages', href: '#/messages', words: 'messages chat dm' }, { title: 'Notifications', href: '#/notifications', words: 'notifications alerts' },
  { title: 'Saved', href: '#/saved', words: 'saved bookmarks' }, { title: 'Nova', href: '#/ai', words: 'nova ai assistant journal goals habits' }, { title: 'AI Council', href: '#/ai/council', words: 'council specialists athena atlas aegis' },
  { title: 'Settings', href: '#/settings', words: 'settings account privacy security notifications accessibility' }, { title: 'Privacy & visibility', href: '#/settings/privacy', words: 'privacy visibility audience blocked' },
  { title: 'Universes', href: '#/universes', words: 'universes freelearn freework freebuild' }, { title: 'My profile', href: '#/me/profile', words: 'profile avatar cover' }, { title: 'Help & support', href: '#/settings/help', words: 'help support report safety' },
];

const LABEL: Record<SearchHit['kind'], string> = { member: 'People', community: 'Communities', post: 'Posts', learn: 'Learn', opportunity: 'Opportunities', event: 'Events', mentor: 'Mentors', page: 'Pages & Universes' };

export const searchModule: ModuleDef = {
  name: 'search',
  register(router, s) {
    router.get('/api/search', { auth: 'active', query: z.object({ q: z.string().trim().min(2).max(60), limit: z.coerce.number().int().min(1).max(10).default(5) }), rate: { key: 'search', limit: 60, windowMs: 60_000 } }, async (c) => {
      const q = c.query.q; const like = likeTerm(q); const lim = c.query.limit; const me = c.me.userId;
      const g = new Map<SearchHit['kind'], SearchHit[]>();
      const add = (k: SearchHit['kind'], h: Omit<SearchHit, 'kind'>) => { const a = g.get(k) ?? []; a.push({ kind: k, ...h }); g.set(k, a); };

      // People: only through discover(), which already honours discoverability, blocks and per-field audiences.
      for (const m of (await discover(s, me, { q, limit: lim })).items) add('member', { id: m.person.id ?? m.person.handle ?? '', title: m.person.displayName, subtitle: m.person.handle ? `@${m.person.handle}` : null, href: `#/u/${m.person.handle}`, isDemo: m.person.isDemo });
      for (const r of await c.db.query<any>(`SELECT slug, name, category, is_demo FROM communities WHERE status = 'active' AND (LOWER(name) LIKE $1 ESCAPE '\\' OR LOWER(description) LIKE $1 ESCAPE '\\' OR LOWER(category) LIKE $1 ESCAPE '\\') ORDER BY name LIMIT ${lim}`, [like])) add('community', { id: r.slug, title: r.name, subtitle: r.category, href: `#/communities/${r.slug}`, isDemo: bool(r.is_demo) });
      // Posts: the same visibility gate as the feed. Results never carry an author, so anonymous posts reveal nothing.
      for (const r of await c.db.query<any>(`SELECT p.id, p.title, p.body, c.name AS c_name FROM posts p LEFT JOIN users pu ON pu.id = p.author_id LEFT JOIN communities c ON c.id = p.community_id
          WHERE ${sqlPostVisible('$1')} AND (p.community_id IS NULL OR c.status = 'active') AND (LOWER(COALESCE(p.title,'')) LIKE $2 ESCAPE '\\' OR LOWER(p.body) LIKE $2 ESCAPE '\\') ORDER BY p.created_at DESC LIMIT ${lim}`, [me, like]))
        add('post', { id: r.id, title: r.title || String(r.body).slice(0, 80), subtitle: r.c_name ?? 'Post', href: `#/post/${r.id}` });
      for (const r of await c.db.query<any>(`SELECT slug, id, title, format, is_demo FROM learn_items WHERE status = 'published' AND (LOWER(title) LIKE $1 ESCAPE '\\' OR LOWER(summary) LIKE $1 ESCAPE '\\' OR LOWER(category) LIKE $1 ESCAPE '\\') ORDER BY title LIMIT ${lim}`, [like])) add('learn', { id: r.id, title: r.title, subtitle: `Learn · ${r.format}`, href: `#/learn/${r.slug}`, isDemo: bool(r.is_demo) });
      for (const r of await c.db.query<any>(`SELECT id, title, organisation, is_demo FROM opportunities WHERE status = 'published' AND (LOWER(title) LIKE $1 ESCAPE '\\' OR LOWER(organisation) LIKE $1 ESCAPE '\\' OR LOWER(description) LIKE $1 ESCAPE '\\') ORDER BY title LIMIT ${lim}`, [like])) add('opportunity', { id: r.id, title: r.title, subtitle: r.organisation, href: `#/opportunities/${r.id}`, isDemo: bool(r.is_demo) });
      for (const r of await c.db.query<any>(`SELECT id, title, starts_at, is_demo FROM events WHERE status = 'published' AND (LOWER(title) LIKE $1 ESCAPE '\\' OR LOWER(description) LIKE $1 ESCAPE '\\') ORDER BY starts_at LIMIT ${lim}`, [like])) add('event', { id: r.id, title: r.title, subtitle: String(r.starts_at).slice(0, 10), href: `#/events/${r.id}`, isDemo: bool(r.is_demo) });
      for (const r of await c.db.query<any>(`SELECT id, name, headline, is_demo FROM mentors WHERE status = 'active' AND (LOWER(name) LIKE $1 ESCAPE '\\' OR LOWER(headline) LIKE $1 ESCAPE '\\' OR LOWER(CAST(expertise AS TEXT)) LIKE $1 ESCAPE '\\') ORDER BY name LIMIT ${lim}`, [like])) add('mentor', { id: r.id, title: r.name, subtitle: r.headline, href: '#/mentors', isDemo: bool(r.is_demo) });
      const ql = q.toLowerCase();
      for (const p of PAGES) if (`${p.title} ${p.words}`.toLowerCase().includes(ql)) add('page', { id: p.href, title: p.title, subtitle: 'Page', href: p.href });
      for (const u of UNIVERSES) if (`${u.name} ${u.tagline}`.toLowerCase().includes(ql)) add('page', { id: u.id, title: u.name, subtitle: 'Universe', href: `#/universes#${u.id}` });

      const groups = [...g.entries()].map(([kind, items]) => ({ kind, label: LABEL[kind], items: items.slice(0, lim) }));
      const out: SearchResponse = { q, groups, total: groups.reduce((n, x) => n + x.items.length, 0) };
      return out;
    });
  },
};
