import type { Db } from '../db';
import { ARCHETYPE_DEFS, type Achievement, type EntryKind, type WidgetSource } from '../../shared/archetypes';
import type { AchievementView, EntryView, WidgetData } from '../../shared/api/identity';
import type { Archetype } from '../../shared/constants';
import type { Services } from '../services';
import { signedMediaUrl } from '../services/media-urls';

export interface Stats { entries: Record<string, number>; learnCompleted: number; posts: number; goalsDone: number; eventsYes: number; mentorRequests: number; tracked: number }

/** Counts used for achievements. Private-by-default sources (journal) are never read; posts are counted only for the owner themself. */
export async function userStats(db: Db, userId: string): Promise<Stats> {
  const n = async (sql: string) => Number((await db.get<{ n: number }>(sql, [userId]))?.n ?? 0);
  const entries: Record<string, number> = {};
  for (const r of await db.query<any>('SELECT kind, COUNT(*) AS n FROM profile_entries WHERE user_id = $1 GROUP BY kind', [userId])) entries[r.kind] = Number(r.n);
  return {
    entries,
    learnCompleted: await n("SELECT COUNT(*) AS n FROM learn_progress WHERE user_id = $1 AND status = 'completed'"),
    posts: await n("SELECT COUNT(*) AS n FROM posts WHERE author_id = $1 AND status = 'published'"),
    goalsDone: await n("SELECT COUNT(*) AS n FROM goals WHERE user_id = $1 AND status = 'done'"),
    eventsYes: await n("SELECT COUNT(*) AS n FROM event_rsvps WHERE user_id = $1 AND response = 'yes'"),
    mentorRequests: await n('SELECT COUNT(*) AS n FROM mentor_requests WHERE user_id = $1'),
    tracked: await n('SELECT COUNT(*) AS n FROM opportunity_tracking WHERE user_id = $1'),
  };
}

export function evaluate(a: Achievement, st: Stats, archetype: Archetype): AchievementView {
  const r = a.rule;
  const have = r.kind === 'entries' ? st.entries[r.entryKind] ?? 0 : r.kind === 'learn_completed' ? st.learnCompleted : r.kind === 'posts' ? st.posts : r.kind === 'goals_done' ? st.goalsDone : r.kind === 'events_yes' ? st.eventsYes : r.kind === 'mentor_requests' ? st.mentorRequests : st.tracked;
  return { id: `${archetype}:${a.id}`, archetype, label: a.label, description: a.description, earned: have >= r.atLeast, progress: Math.min(have, r.atLeast), target: r.atLeast };
}

export const entryView = (s: Services, viewerId: string, r: any): EntryView => ({
  id: r.id, kind: r.kind, identityId: r.identity_id ?? null, title: r.title, description: r.description ?? null, link: r.link ?? null,
  mediaUrl: r.media_id ? signedMediaUrl(s, viewerId, r.media_id) : null, occurredOn: r.occurred_on ?? null, evidence: r.evidence_type, visibility: r.visibility,
  pinned: r.pinned === true || r.pinned === 1, createdAt: r.created_at,
});

type Item = WidgetData['items'][number];
/** Data for one widget source. Only ever the signed-in person's own data. */
export async function widgetItems(s: Services, userId: string, source: WidgetSource): Promise<Item[]> {
  const db = s.db;
  if (source === 'prompt' || source === 'planned') return [];
  if (source.startsWith('entries:')) {
    const kind = source.slice(8) as EntryKind;
    return (await db.query<any>('SELECT title, description, link FROM profile_entries WHERE user_id = $1 AND kind = $2 ORDER BY pinned DESC, created_at DESC LIMIT 5', [userId, kind])).map((r) => ({ title: r.title, subtitle: r.description ? String(r.description).slice(0, 80) : null, href: '#/me/profile' }));
  }
  switch (source) {
    case 'learn_progress':
      return (await db.query<any>('SELECT l.title, l.slug, p.status, p.percent FROM learn_progress p JOIN learn_items l ON l.id = p.item_id WHERE p.user_id = $1 ORDER BY p.updated_at DESC LIMIT 4', [userId])).map((r) => ({ title: r.title, subtitle: r.status === 'completed' ? 'Completed' : `${r.percent}% done`, href: `#/learn/${r.slug}`, progress: Number(r.percent) }));
    case 'opportunities':
      return (await db.query<any>('SELECT o.title, o.id, t.status FROM opportunity_tracking t JOIN opportunities o ON o.id = t.opportunity_id WHERE t.user_id = $1 ORDER BY t.updated_at DESC LIMIT 4', [userId])).map((r) => ({ title: r.title, subtitle: r.status, href: `#/opportunities/${r.id}` }));
    case 'events':
      return (await db.query<any>("SELECT e.title, e.id, e.starts_at FROM event_rsvps r JOIN events e ON e.id = r.event_id WHERE r.user_id = $1 AND r.response <> 'no' AND e.starts_at >= $2 ORDER BY e.starts_at LIMIT 4", [userId, s.now().toISOString()])).map((r) => ({ title: r.title, subtitle: String(r.starts_at).slice(0, 10), href: `#/events/${r.id}` }));
    case 'goals':
      return (await db.query<any>("SELECT title, status FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 4", [userId])).map((r) => ({ title: r.title, subtitle: 'Private goal', href: '#/ai/goals' }));
    case 'habits':
      return (await db.query<any>('SELECT title, cadence FROM habits WHERE user_id = $1 AND archived_at IS NULL ORDER BY created_at LIMIT 4', [userId])).map((r) => ({ title: r.title, subtitle: `Private · ${r.cadence}`, href: '#/ai/habits' }));
    case 'communities':
      return (await db.query<any>("SELECT c.name, c.slug FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.user_id = $1 AND c.status = 'active' ORDER BY m.joined_at DESC LIMIT 4", [userId])).map((r) => ({ title: r.name, subtitle: 'Community', href: `#/communities/${r.slug}` }));
    case 'mentor_requests':
      return (await db.query<any>('SELECT m.name, r.status FROM mentor_requests r JOIN mentors m ON m.id = r.mentor_id WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 4', [userId])).map((r) => ({ title: r.name, subtitle: `Request ${r.status}`, href: '#/mentors' }));
    case 'saved':
      return (await db.query<any>("SELECT l.title, l.slug FROM saved_items s JOIN learn_items l ON l.id = s.ref_id WHERE s.user_id = $1 AND s.kind = 'learn' ORDER BY s.created_at DESC LIMIT 4", [userId])).map((r) => ({ title: r.title, subtitle: 'Saved', href: `#/learn/${r.slug}` }));
  }
  return [];
}

export async function widgetData(s: Services, userId: string, archetype: Archetype): Promise<WidgetData[]> {
  const out: WidgetData[] = [];
  for (const w of ARCHETYPE_DEFS[archetype].widgets) out.push({ id: `${archetype}:${w.id}`, title: w.title, source: w.source, wide: !!w.wide, href: w.href ?? null, empty: w.empty, items: await widgetItems(s, userId, w.source), planned: w.source === 'planned' });
  return out;
}
