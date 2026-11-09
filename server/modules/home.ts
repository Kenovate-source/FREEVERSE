import type { ModuleDef } from './types';
import { ARCHETYPE_DEFS } from '../../shared/archetypes';
import type { HomeView, WidgetData } from '../../shared/api/identity';
import { evaluate, userStats, widgetData, widgetItems } from '../identity/stats';
import { myIdentities } from './identities';
import { UNIVERSES } from '../../shared/universes';

export const homeModule: ModuleDef = {
  name: 'home',
  register(router, s) {
    // The adaptive home: the main identity's widgets first, then a couple from each other active identity, or a general
    // set when the person has chosen none. Next steps are derived from what is actually missing; nothing is faked.
    router.get('/api/home', { auth: 'active' }, async (c) => {
      const me = c.me.userId;
      const ids = (await myIdentities(c.db, me)).filter((i) => i.status === 'active');
      const prof = await c.db.get<any>('SELECT u.display_name, p.bio FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1', [me]);
      const widgets: HomeView['widgets'] = [];
      const seen = new Set<string>();
      const push = (w: WidgetData, from: HomeView['widgets'][number]['fromIdentity']) => { const key = `${w.source}:${w.title}`; if (w.planned || seen.has(key)) return; seen.add(key); widgets.push({ ...w, fromIdentity: from }); };
      for (const [n, i] of ids.entries()) {
        const all = await widgetData(s, me, i.archetype);
        for (const w of all.filter((x) => !x.planned).slice(0, n === 0 ? 4 : 2)) push(w, i.archetype);
      }
      if (!ids.length) {
        for (const [id, title, source, empty, href] of [['g-learn', 'Continue learning', 'learn_progress', 'Start something in Learn.', '#/learn'], ['g-events', 'Coming up', 'events', 'RSVP to an event to see it here.', '#/events'], ['g-comm', 'Your communities', 'communities', 'Join a community to see it here.', '#/communities'], ['g-opps', 'Tracked opportunities', 'opportunities', 'Track an opportunity to see it here.', '#/opportunities']] as const)
          push({ id, title, source, wide: false, href, empty, items: await widgetItems(s, me, source), planned: false }, null);
      }
      const next: HomeView['nextSteps'] = [];
      if (!ids.length) next.push({ id: 'identity', title: 'Choose an identity', description: 'Optional. It tailors your home, tools and profile sections.', href: '#/identities' });
      if (!prof?.bio) next.push({ id: 'profile', title: 'Tell people a little about you', description: 'A short bio and an avatar or photo. You choose who can see them.', href: '#/me/profile' });
      const tags = await c.db.get<any>("SELECT COUNT(*) AS n FROM user_tags WHERE user_id = $1 AND kind = 'interest'", [me]);
      if (!Number(tags?.n)) next.push({ id: 'interests', title: 'Pick a few interests', description: 'Helps Explore explain why things match you.', href: '#/settings/profile' });
      const comm = await c.db.get<any>('SELECT COUNT(*) AS n FROM community_members WHERE user_id = $1', [me]);
      if (!Number(comm?.n)) next.push({ id: 'community', title: 'Join a community', description: 'Say hello in the Welcome Lounge or find a space that fits.', href: '#/communities' });
      next.push({ id: 'privacy', title: 'Review your privacy', description: 'See exactly who can see what, in plain language.', href: '#/settings/privacy' });
      // "Where am I right now?": counts from your own inbox and notifications (never message text) and what you have earned.
      const unreadN = await c.db.get<any>('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [me]);
      const unreadC = await c.db.get<any>("SELECT COUNT(*) AS n FROM conversation_members cm WHERE cm.user_id = $1 AND cm.status = 'accepted' AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = cm.conversation_id AND m.deleted_at IS NULL AND m.sender_id <> $1 AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at))", [me]);
      const reqs = await c.db.get<any>("SELECT COUNT(*) AS n FROM conversation_members WHERE user_id = $1 AND status = 'request'", [me]);
      const st = await userStats(c.db, me); const earnedAll = [] as { id: string; label: string }[];
      for (const i of ids) for (const a of ARCHETYPE_DEFS[i.archetype].achievements) { const e = evaluate(a, st, i.archetype); if (e.earned) earnedAll.push({ id: e.id, label: e.label }); }
      const viaMap = new Map<string, HomeView['identities'][number]['archetype'][]>();
      for (const i of ids) for (const u of ARCHETYPE_DEFS[i.archetype].universes) viaMap.set(u, [...(viaMap.get(u) ?? []), i.archetype]);
      const ecoUniverses = UNIVERSES.filter((u) => viaMap.has(u.id)).map((u) => ({ id: u.id, name: u.name, accent: u.accent, route: u.route ?? `/universes/${u.id}`, status: u.status, via: viaMap.get(u.id)! }));
      const lrn = await c.db.query<any>("SELECT l.title, l.slug, l.format, l.minutes, l.is_demo FROM learn_items l WHERE l.status = 'published' AND NOT EXISTS (SELECT 1 FROM learn_progress p WHERE p.item_id = l.id AND p.user_id = $1) ORDER BY l.created_at DESC, l.title LIMIT 3", [me]);
      const opp = await c.db.query<any>("SELECT o.title, o.id, o.type, o.is_demo FROM opportunities o WHERE o.status = 'published' AND NOT EXISTS (SELECT 1 FROM opportunity_tracking t WHERE t.opportunity_id = o.id AND t.user_id = $1) ORDER BY o.created_at DESC, o.title LIMIT 3", [me]);
      const recommended: HomeView['recommended'] = {
        learn: lrn.map((r) => ({ title: r.title, href: `#/learn/${r.slug}`, subtitle: `${r.format}${r.minutes ? ` · ${r.minutes} min` : ''}`, demo: !!r.is_demo })),
        opportunities: opp.map((r) => ({ title: r.title, href: `#/opportunities/${r.id}`, subtitle: String(r.type).replace(/_/g, ' '), demo: !!r.is_demo })),
      };
      const out: HomeView = {
        greeting: prof?.display_name ? `Hi, ${String(prof.display_name).split(' ')[0]}` : 'Welcome',
        identities: ids.map((i) => ({ id: i.id, archetype: i.archetype, label: ARCHETYPE_DEFS[i.archetype].label, icon: ARCHETYPE_DEFS[i.archetype].icon, accent: ARCHETYPE_DEFS[i.archetype].accent, isPrimary: i.isPrimary })),
        ecosystem: { universes: ecoUniverses }, recommended,
        widgets, nextSteps: next.slice(0, 4), mode: ids.length ? 'identity' : 'general',
        activity: { unreadNotifications: Number(unreadN?.n ?? 0), unreadConversations: Number(unreadC?.n ?? 0), messageRequests: Number(reqs?.n ?? 0), earned: earnedAll.slice(0, 3), earnedTotal: earnedAll.length },
      };
      return out;
    });
  },
};
