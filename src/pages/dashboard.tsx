// The Dashboard: a personal ecosystem command centre, not a feed (the Feed has its own page at /feed).
// Everything here is the person's own real data: their identities, the Universes those identities connect to, their progress,
// goals, events, messages (names and counts only, never message text) and the places they actually use. Nothing is invented.
import { useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { Link } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Async, Badge, Card, EmptyState, useResource } from '../ui/kit';
import { lastVisit, topVisits } from '../lib/visits';
import { HomeActivity, TodayCard } from './social';
import type { HomeView, WidgetData } from '../../shared/api/identity';
import type { ConversationView } from '../../shared/api/messages';

type P = { params: Record<string, string>; query: URLSearchParams };
type Eco = HomeView['ecosystem']['universes'][number];

/** Spread n points around an ellipse, starting at the top. */
const around = (n: number, cx: number, cy: number, rx: number, ry: number, phase = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = phase + (i / Math.max(n, 1)) * Math.PI * 2; return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, cos: Math.cos(a) }; });

/** The citizen's ecosystem: You in the middle, your identities around you, the Universes they connect to on the outer ring.
 *  Lines are the real identity-to-Universe relationships. Every node opens its destination and works with the keyboard. */
export function EcosystemMap({ home }: { home: HomeView }) {
  const [focus, setFocus] = useState<string | null>(null);
  const ids = home.identities; const unis = home.ecosystem.universes;
  const W = 560, H = 430, cx = W / 2, cy = H / 2;
  const idPos = useMemo(() => around(ids.length, cx, cy, 104, 80), [ids.length]);
  const unPos = useMemo(() => around(unis.length, cx, cy, 205, 150, -Math.PI / 2 + 0.2), [unis.length]);
  const idIndex = new Map(ids.map((i, k) => [i.archetype, k]));
  const lit = (via: string[], uid?: string) => !focus || focus === uid || via.includes(focus);
  if (!ids.length) return <EmptyState title="Your ecosystem starts with an identity" icon="sparkles">Choose one or more identities and this map shows the Universes they connect to. <Link to="/identities">Choose an identity</Link></EmptyState>;
  return (
    <figure className="dmap" aria-label="Your ecosystem map">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="You, your identities, and the Universes they connect to" className="dmap-svg">
        <g aria-hidden="true">
          <ellipse cx={cx} cy={cy} rx={104} ry={80} className="dmap-ring" /><ellipse cx={cx} cy={cy} rx={205} ry={150} className="dmap-ring" />
          {ids.map((i, k) => <line key={i.id} x1={cx} y1={cy} x2={idPos[k]!.x} y2={idPos[k]!.y} stroke={i.accent} className="dmap-spoke" opacity={lit([i.archetype]) ? 0.5 : 0.1} />)}
          {unis.map((u, k) => u.via.map((a) => { const ik = idIndex.get(a); if (ik === undefined) return null; return <line key={`${u.id}-${a}`} x1={idPos[ik]!.x} y1={idPos[ik]!.y} x2={unPos[k]!.x} y2={unPos[k]!.y} stroke={u.accent} className="dmap-flow" opacity={lit(u.via, u.id) && (!focus || focus === u.id || focus === a) ? 0.8 : 0.1} />; }))}
        </g>
        {unis.map((u, k) => { const p = unPos[k]!; const anchor = p.cos > 0.3 ? 'start' : p.cos < -0.3 ? 'end' : 'middle'; const dx = anchor === 'start' ? 16 : anchor === 'end' ? -16 : 0; const dy = anchor === 'middle' ? (p.y < cy ? -16 : 24) : 4;
          return <a key={u.id} href={`#${u.route}`} className="dmap-node dmap-uni" onMouseEnter={() => setFocus(u.id)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(u.id)} onBlur={() => setFocus(null)} aria-label={`${u.name}, connected through ${u.via.map((a) => ids.find((i) => i.archetype === a)?.label).filter(Boolean).join(' and ')}${u.status === 'available' ? '' : `, ${u.status}`}`} style={{ opacity: lit(u.via, u.id) ? 1 : 0.35 }}>
            <circle cx={p.x} cy={p.y} r={11} fill={u.accent} className="dmap-dot" /><text x={p.x + dx} y={p.y + dy} textAnchor={anchor} className="dmap-label">{u.name}</text></a>; })}
        {ids.map((i, k) => <a key={i.id} href={`#/spaces/${i.archetype}`} className="dmap-node dmap-id" onMouseEnter={() => setFocus(i.archetype)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(i.archetype)} onBlur={() => setFocus(null)} aria-label={`${i.label} identity space`}>
          <circle cx={idPos[k]!.x} cy={idPos[k]!.y} r={19} fill="rgba(8,12,34,0.9)" stroke={i.accent} strokeWidth={2.5} className="dmap-dot" /><text x={idPos[k]!.x} y={idPos[k]!.y - 26} textAnchor="middle" className="dmap-label dmap-label-id">{i.label}</text></a>)}
        <a href="#/me/profile" className="dmap-node dmap-you" aria-label="You: open your profile"><circle cx={cx} cy={cy} r={26} className="dmap-you-dot" /><text x={cx} y={cy + 5} textAnchor="middle" className="dmap-you-text">You</text></a>
      </svg>
      <figcaption className="faint small">Lines show which Universes each of your identities really connects to. Select any node to open it.</figcaption>
    </figure>
  );
}

/** A dashboard panel: shows a few rows, expands to show the rest, and opens its destination. */
function Panel({ title, icon, href, openLabel, children, extra, count, wide }: { title: string; icon: string; href?: string; openLabel?: string; children: ReactNode; extra?: ReactNode; count?: number; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Card as="section" className={`dash-panel${wide ? ' wide' : ''}`} aria-label={title}>
    <div className="spread"><h2 className="h-sm dash-h"><Icon name={icon} size={16} /> {title}</h2>{count !== undefined && count > 0 && <Badge>{count}</Badge>}</div>
    <div className={open ? 'dash-body open' : 'dash-body'}>{children}</div>
    <div className="row-wrap dash-foot">{extra && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Show more'}</button>}{href && <Link to={href} className="btn btn-ghost btn-sm">{openLabel ?? 'Open'}</Link>}</div>
    {open && extra}
  </Card>;
}
const Rows = ({ items, empty }: { items: { title: string; subtitle?: string | null; href?: string | null; progress?: number; demo?: boolean }[]; empty: string }) => items.length === 0 ? <p className="muted">{empty}</p> :
  <ul className="plain stack-sm">{items.map((i, k) => <li key={k}>{i.href ? <Link to={i.href}>{i.title}</Link> : i.title}{i.demo && <> <Badge>Sample</Badge></>}{i.subtitle && <div className="faint">{i.subtitle}</div>}{typeof i.progress === 'number' && <div className="dash-bar" role="progressbar" aria-label={`${i.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={i.progress}><span style={{ width: `${Math.max(0, Math.min(100, i.progress))}%` }} /></div>}</li>)}</ul>;

const pick = (ws: HomeView['widgets'], ...sources: string[]) => ws.filter((w) => sources.includes(w.source));
const flat = (ws: WidgetData[]) => ws.flatMap((w) => w.items);

export function HomePage(_: P) {
  const home = useResource(() => api.get<HomeView>('/api/home'), []);
  const convs = useResource(() => api.get<{ items: ConversationView[]; requests: ConversationView[]; unreadTotal: number }>('/api/conversations').catch(() => null), []);
  const visits = useMemo(() => ({ top: topVisits(4), last: lastVisit() }), []);
  return (
    <div className="stack-lg dash">
      <Async res={home}>{(h) => {
        const learn = pick(h.widgets, 'learn_progress'); const goals = pick(h.widgets, 'goals', 'habits'); const upcoming = pick(h.widgets, 'events', 'mentor_requests'); const tracked = pick(h.widgets, 'opportunities');
        const shown = new Set([...learn, ...goals, ...upcoming, ...tracked]); const more = h.widgets.filter((w) => !shown.has(w));
        const inProgress = flat(learn).find((i) => typeof i.progress === 'number' && i.progress < 100 && i.href);
        const resume = inProgress ? { title: inProgress.title, href: inProgress.href!, why: `${inProgress.progress}% through` } : null;
        const chats = (convs.data?.items ?? []).filter((c) => c.unread > 0).slice(0, 3);
        return (<>
          <section className="dash-hero" aria-label="Welcome">
            <div className="stack-sm"><p className="eyebrow">Your FREEVERSE</p><h1>{h.greeting}</h1>
              <p className="muted">{h.mode === 'identity' ? 'Here is where you are, what is waiting, and where you could go next.' : 'Pick an identity and this dashboard maps the Universes around what you do.'}</p>
              {h.identities.length > 0 && <div className="row-wrap" aria-label="Your identities">{h.identities.map((i) => <Link key={i.id} to={`/spaces/${i.archetype}`} className="chip chip-link"><Icon name={i.icon} size={14} /> {i.label}</Link>)}</div>}
              <div className="row-wrap"><Link to="/feed" className="btn btn-secondary btn-sm">Open the Feed</Link><Link to="/identities" className="btn btn-ghost btn-sm">{h.identities.length ? 'Change identities' : 'Choose an identity'}</Link></div>
            </div>
            <div className="dash-map"><EcosystemMap home={h} /></div>
          </section>

          <div className="dash-grid">
            <TodayCard /><HomeActivity a={h.activity} />
            <Panel title="Continue where you left off" icon="refresh" href={resume?.href ?? visits.last?.path} openLabel="Continue">
              {resume ? <p><Link to={resume.href}><strong>{resume.title}</strong></Link><span className="faint"> · {resume.why}</span></p> : <p className="muted">Nothing in progress yet. Start something in <Link to="/learn">Learn</Link>.</p>}
              {visits.last && <p className="faint">Last place you visited on this device: <Link to={visits.last.path}>{visits.last.title}</Link></p>}
            </Panel>
            <Panel title="Progress and milestones" icon="target" href="/learn" openLabel="Learn" extra={h.activity.earnedTotal > 0 ? <p className="faint">Earned: {h.activity.earned.map((e) => e.label).join(', ')}{h.activity.earnedTotal > h.activity.earned.length ? ` and ${h.activity.earnedTotal - h.activity.earned.length} more` : ''}.</p> : undefined}>
              <Rows items={flat(learn)} empty="No learning in progress. Your progress shows up here as you go." />
              {h.activity.earnedTotal > 0 && <p><Badge tone="ok">{h.activity.earnedTotal}</Badge> milestone{h.activity.earnedTotal === 1 ? '' : 's'} earned</p>}
            </Panel>
            <Panel title="Goals and projects" icon="target" href="/ai/goals" openLabel="Goals"><Rows items={flat(goals)} empty="No active goals or habits. They stay private to you." /></Panel>
            <Panel title="Coming up" icon="info" href="/events" openLabel="Events"><Rows items={flat(upcoming)} empty="Nothing scheduled. RSVP to an event or request a mentor and it appears here." /></Panel>
            <Panel title="Recommended for you" icon="sparkles" href="/explore" openLabel="Explore" extra={h.recommended.opportunities.length ? <Rows items={h.recommended.opportunities} empty="" /> : undefined}>
              <Rows items={h.recommended.learn} empty="You have started everything in the catalogue." />
              <p className="faint small">Items you have not started yet. Not personalised by an algorithm.</p>
            </Panel>
            <Panel title="Recent messages" icon="send" href="/messages" openLabel="Messages">
              {chats.length === 0 ? <p className="muted">No unread conversations.</p> : <ul className="plain stack-sm">{chats.map((c) => <li key={c.id}><Link to={`/messages/${c.id}`}>{c.other.displayName}</Link> <Badge>{c.unread} new</Badge></li>)}</ul>}
              <p className="faint small">Names and counts only. Message text is never shown here.</p>
            </Panel>
            <Panel title="Quick access" icon="compass">
              {visits.top.length === 0 ? <p className="muted">The places you use most appear here after you have visited them a couple of times. Kept on this device only.</p> : <ul className="plain stack-sm">{visits.top.map((v) => <li key={v.path}><Link to={v.path}>{v.title}</Link> <span className="faint">· {v.count} visits</span></li>)}</ul>}
            </Panel>
            <Panel title="Next steps" icon="sparkles">
              {h.nextSteps.length === 0 ? <p className="muted">You have done the basics.</p> : <ul className="plain stack-sm">{h.nextSteps.map((s) => <li key={s.id}><Link to={s.href}><strong>{s.title}</strong></Link><div className="muted">{s.description}</div></li>)}</ul>}
            </Panel>
          </div>
          {(tracked.length > 0 || more.length > 0) && <section className="stack" aria-label="From your identities"><h2 className="h-sm">From your identities</h2><div className="grid-cards">{[...tracked, ...more].map((w) => <DashWidget key={w.id} w={w} />)}</div></section>}
        </>);
      }}</Async>
    </div>
  );
}
function DashWidget({ w }: { w: WidgetData }) { return <Card as="section" className="widget" aria-label={w.title}><h3 className="h-sm">{w.title}</h3><Rows items={w.items} empty={w.empty} />{w.href && <Link to={w.href} className="btn btn-ghost btn-sm">Open</Link>}</Card>; }
