import type { ModuleDef } from './types';
import { notFound } from '../http/errors';
import { ARCHETYPES } from '../../shared/constants';
import { ARCHETYPE_DEFS } from '../../shared/archetypes';
import type { SpaceView } from '../../shared/api/identity';
import { entryView, evaluate, userStats, widgetData } from '../identity/stats';
import { myIdentities } from './identities';

export const spacesModule: ModuleDef = {
  name: 'spaces',
  register(router, s) {
    // An identity space is a different workspace, not a re-skin: its own navigation, widgets, tools, profile sections,
    // terminology and achievements. Everything in it is the signed-in person's own data.
    router.get('/api/spaces', { auth: 'active' }, async (c) => ({
      items: (await myIdentities(c.db, c.me.userId)).map((i) => { const d = ARCHETYPE_DEFS[i.archetype]; return { archetype: i.archetype, label: d.label, icon: d.icon, accent: d.accent, tagline: d.tagline, status: i.status, isPrimary: i.isPrimary }; }),
    }));
    router.get('/api/spaces/:archetype', { auth: 'active' }, async (c) => {
      const a = (ARCHETYPES as readonly string[]).includes(String(c.params.archetype)) ? (c.params.archetype as (typeof ARCHETYPES)[number]) : null;
      const identity = a ? (await myIdentities(c.db, c.me.userId)).find((i) => i.archetype === a) : null;
      if (!a || !identity) throw notFound('You don’t have that identity yet. Add it from your identities.');
      const d = ARCHETYPE_DEFS[a]; const st = await userStats(c.db, c.me.userId);
      const entries = await c.db.query<any>('SELECT * FROM profile_entries WHERE user_id = $1 ORDER BY pinned DESC, created_at DESC', [c.me.userId]);
      const space: SpaceView = {
        archetype: a, label: d.label, icon: d.icon, accent: d.accent, tagline: d.tagline, vocab: d.vocab, nav: d.nav,
        widgets: await widgetData(s, c.me.userId, a), tools: d.tools.map((t) => ({ id: t.id, label: t.label, description: t.description, status: t.status, href: t.href ?? null })),
        sections: d.profileSections.map((sec) => ({ ...sec, entries: entries.filter((e) => e.kind === sec.kind).map((e) => entryView(s, c.me.userId, e)) })),
        achievements: d.achievements.map((x) => evaluate(x, st, a)), identity,
      };
      return { space };
    });
  },
};
