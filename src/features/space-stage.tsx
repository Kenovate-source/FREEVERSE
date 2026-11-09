// The workspace of an identity space: the tools, milestones and destinations drawn as objects in that identity's own environment.
// Every object is a real button or link with a label, and the Tools section lists the very same things as plain text, so nothing
// depends on the graphics. Planned tools are shown as planned; nothing here pretends a tool exists when it does not.
import { useState, type CSSProperties } from 'react';
import { Link } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/kit';
import type { SpaceView } from '../../shared/api/identity';
import type { Layout, SpaceDesign } from '../../shared/space-design';

type Tool = SpaceView['tools'][number];
const ICON: Record<string, string> = { paths: 'book', goals: 'target', habits: 'target', tracker: 'briefcase', mentors: 'heart', showcase: 'image', posts: 'send', games: 'game', projects: 'sparkles', resources: 'book', venture: 'sparkles', communities: 'users', opps: 'briefcase', log: 'book', profile: 'user', reading: 'book', outputs: 'sparkles' };
const iconFor = (t: Tool) => ICON[t.id] ?? (t.status === 'planned' ? 'info' : 'sparkles');

/** One tool as an object. Selecting it reveals what it is; the detail is the same in every layout. */
function ToolObject({ t, layout, i, on, pick }: { t: Tool; layout: Layout; i: number; on: boolean; pick: () => void }) {
  return <button type="button" className={`tool-obj tool-obj--${layout}${on ? ' on' : ''}${t.status === 'planned' ? ' planned' : ''}`} style={{ ['--i' as string]: i } as CSSProperties} aria-pressed={on} aria-controls="tool-detail" onClick={pick}>
    <span className="tool-obj-ico" aria-hidden="true"><Icon name={iconFor(t)} size={22} /></span><span className="tool-obj-name">{t.label}</span>{t.status === 'planned' && <span className="tool-obj-tag">Planned</span>}
  </button>;
}
function ToolDetail({ t, noun }: { t: Tool | null; noun: string }) {
  return <div id="tool-detail" className="tool-detail" role="region" aria-live="polite" aria-label="Selected tool">
    {!t ? <p className="muted">Select a {noun} to see what it is and what you can do with it.</p> : <>
      <div className="spread"><h3 className="h-sm">{t.label}</h3>{t.status === 'available' ? <Badge tone="ok">Available</Badge> : <Badge>Planned</Badge>}</div>
      <p>{t.description}</p>
      {t.status === 'available' && t.href ? <Link to={t.href} className="btn btn-primary btn-sm">Open {t.label}</Link> : <p className="faint">Not built yet. It is listed so you can see where this space is heading; it does nothing today.</p>}
    </>}
  </div>;
}

export function SpaceStage({ s, design }: { s: SpaceView; design: SpaceDesign }) {
  const [sel, setSel] = useState<string | null>(null); const L = design.layout;
  const tool = s.tools.find((t) => t.id === sel) ?? null;
  const obj = (t: Tool, i: number) => <ToolObject key={t.id} t={t} layout={L} i={i} on={sel === t.id} pick={() => setSel(sel === t.id ? null : t.id)} />;
  const entries = s.sections.flatMap((x) => x.entries.map((e) => ({ ...e, label: x.label })));
  const inMotion = s.widgets.flatMap((w) => w.items.map((i) => ({ ...i, from: w.title }))).slice(0, 4);
  const go = (n: { id: string; label: string; href: string }, cls = '') => <Link key={n.id} to={n.href} className={`sp-stage-go ${cls}`}>{n.label}</Link>;
  const detail = <ToolDetail t={tool} noun={design.objectNoun} />;
  const earned = s.achievements.filter((a) => a.earned).length;

  if (L === 'studio') return <div className="sp-stage sp-stage-studio" aria-label={design.stageLabel}>
    <div className="sp-studio-table">{s.tools.map(obj)}</div>
    <div className="sp-studio-frames" aria-label="Your pieces">{entries.slice(0, 3).map((e, k) => <figure key={e.id} className="sp-frame" style={{ ['--i' as string]: k } as CSSProperties}><div className="sp-frame-art" aria-hidden="true" /><figcaption>{e.title}</figcaption></figure>)}{entries.length === 0 && <Link to="/me/profile" className="sp-frame sp-frame-empty"><div className="sp-frame-art" aria-hidden="true" /><figcaption>Your first piece goes here: add it to your profile</figcaption></Link>}</div>
    <div className="sp-studio-wall" aria-label="Pinned places">{s.nav.map((n, k) => go(n, `sp-pin sp-pin-${k % 3}`))}</div>
    {detail}</div>;

  if (L === 'pathway') return <div className="sp-stage sp-stage-pathway" aria-label={design.stageLabel}>
    <ol className="sp-steps">{s.achievements.map((a, k) => <li key={a.id} className={`sp-step${a.earned ? ' earned' : ''}`} style={{ ['--k' as string]: k } as CSSProperties}><span className="sp-step-mark" aria-hidden="true">{a.earned ? '✓' : k + 1}</span><span><strong>{a.label}</strong><span className="faint"> {a.earned ? 'Earned' : `${a.progress} of ${a.target}`}</span></span></li>)}
      <li className="sp-step sp-summit" style={{ ['--k' as string]: s.achievements.length } as CSSProperties}><span className="sp-step-mark" aria-hidden="true">★</span><span>{s.nav[0] ? go(s.nav[0], 'sp-summit-link') : 'Where this leads'}</span></li></ol>
    <div className="sp-waypoints" aria-label="Waypoints">{s.tools.map(obj)}</div>{detail}</div>;

  if (L === 'lanes') return <div className="sp-stage sp-stage-lanes" aria-label={design.stageLabel}>
    <section className="sp-lane" aria-label="Tools"><h3 className="sp-lane-h">Tools</h3><div className="sp-lane-row">{s.tools.map(obj)}</div></section>
    <section className="sp-lane" aria-label="In motion"><h3 className="sp-lane-h">In motion</h3><div className="sp-lane-row">{inMotion.length ? inMotion.map((m, k) => <div key={k} className="sp-lane-card"><strong>{m.title}</strong><span className="faint">{m.subtitle ?? m.from}</span></div>) : <p className="muted">Nothing in motion yet. What you track appears here.</p>}</div></section>
    <section className="sp-lane" aria-label="Go to"><h3 className="sp-lane-h">Go to</h3><div className="sp-lane-row">{s.nav.map((n) => go(n, 'sp-lane-card'))}</div></section>{detail}</div>;

  if (L === 'console') return <div className="sp-stage sp-stage-console" aria-label={design.stageLabel}>
    <nav className="sp-con-tree" aria-label="Places"><span className="sp-con-dim">~/{s.archetype}/</span>{s.nav.map((n) => <Link key={n.id} to={n.href} className="sp-con-file">› {n.label}</Link>)}</nav>
    <div className="sp-con-term"><div className="sp-con-bar" aria-hidden="true"><i /><i /><i /></div><div className="sp-con-lines">{s.tools.map(obj)}</div>{detail}</div>
    <aside className="sp-con-status" aria-label="Status"><span className="sp-con-dim">status</span>{s.widgets.slice(0, 4).map((w) => <div key={w.id} className="sp-con-stat"><span>{w.title}</span><strong>{w.items.length}</strong></div>)}<div className="sp-con-stat"><span>milestones</span><strong>{earned}/{s.achievements.length}</strong></div></aside></div>;

  if (L === 'stages') return <div className="sp-stage sp-stage-stages" aria-label={design.stageLabel}>
    <ol className="sp-runway">{s.tools.map((t, i) => <li key={t.id} className="sp-runway-stop"><span className="sp-runway-flag" aria-hidden="true">{i + 1}</span>{obj(t, i)}</li>)}</ol>
    <div className="sp-runway-signals" aria-label="Signals">{inMotion.length ? inMotion.map((m, k) => <div key={k} className="sp-signal"><strong>{m.title}</strong><span className="faint">{m.subtitle ?? m.from}</span></div>) : <p className="muted">No activity yet. Your own progress shows here.</p>}</div>
    <div className="sp-runway-go">{s.nav.map((n) => go(n, 'sp-runway-btn'))}</div>{detail}</div>;

  if (L === 'arena') return <div className="sp-stage sp-stage-arena" aria-label={design.stageLabel}>
    <div className="sp-hud" aria-label="Progress"><span>Achievements</span><div className="sp-hud-bar" role="progressbar" aria-label="Achievements earned" aria-valuemin={0} aria-valuemax={s.achievements.length} aria-valuenow={earned}><span style={{ width: `${s.achievements.length ? (earned / s.achievements.length) * 100 : 0}%` }} /></div><strong>{earned}/{s.achievements.length}</strong></div>
    <div className="sp-hex-field">{s.tools.map(obj)}</div>
    <div className="sp-queue" aria-label="Jump in">{s.nav.map((n) => go(n, 'sp-queue-btn'))}</div>{detail}</div>;

  if (L === 'board') return <div className="sp-stage sp-stage-board" aria-label={design.stageLabel}>
    <div className="sp-pins">{s.tools.map(obj)}{entries.slice(0, 3).map((e, k) => <article key={e.id} className="sp-index-card" style={{ ['--i' as string]: k } as CSSProperties}><strong>{e.title}</strong><span className="faint">{e.label}</span></article>)}</div>
    <div className="sp-board-nav" aria-label="Places">{s.nav.map((n) => go(n, 'sp-board-tab'))}</div>{detail}</div>;

  if (L === 'desk') { const today = (new Date().getDay() + 6) % 7; return <div className="sp-stage sp-stage-desk" aria-label={design.stageLabel}>
    <div className="sp-week" aria-label="This week">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => <span key={d} className={`sp-day${i === today ? ' now' : ''}`} aria-current={i === today ? 'date' : undefined}>{d}</span>)}</div>
    <div className="sp-shelf" aria-label="Study tools">{s.tools.map(obj)}</div>
    <ul className="sp-sheet" aria-label="Milestones">{s.achievements.map((a) => <li key={a.id} className={a.earned ? 'earned' : ''}><span aria-hidden="true">{a.earned ? '☑' : '☐'}</span> {a.label}<span className="faint"> {a.earned ? 'earned' : `${a.progress} of ${a.target}`}</span></li>)}</ul>
    <div className="sp-folders" aria-label="Places">{s.nav.map((n) => go(n, 'sp-folder'))}</div>{detail}</div>; }

  if (L === 'reading') return <div className="sp-stage sp-stage-reading" aria-label={design.stageLabel}>
    <div className="sp-spines" aria-label="Research tools">{s.tools.map(obj)}</div>
    <ol className="sp-refs" aria-label="Your outputs">{entries.length ? entries.slice(0, 5).map((e) => <li key={e.id}>{e.title} <span className="faint">({e.label})</span></li>) : <li className="muted">Your outputs are listed here as references once you add them.</li>}</ol>
    <p className="sp-foot" aria-label="Places">{s.nav.map((n, k) => <span key={n.id}>{go(n, 'sp-footnote')}{k < s.nav.length - 1 ? ' · ' : ''}</span>)}</p>{detail}</div>;

  if (L === 'pipeline') return <div className="sp-stage sp-stage-pipeline" aria-label={design.stageLabel}>
    <div className="sp-funnel">{s.tools.map((t, i) => <div key={t.id} className="sp-gate" style={{ ['--w' as string]: `${100 - i * 16}%` } as CSSProperties}>{obj(t, i)}</div>)}</div>
    <div className="sp-exits" aria-label="Places">{s.nav.map((n) => go(n, 'sp-exit'))}</div>{detail}</div>;

  if (L === 'portfolio' || L === 'gathering') { const arc = L === 'gathering'; const inner = s.tools.map((t, i) => ({ k: 'tool' as const, t, i })); const outer = s.nav.map((n) => ({ k: 'nav' as const, n }));
    const ang = (i: number, n: number) => arc ? -170 + (160 * (i + 0.5)) / Math.max(n, 1) : (360 / Math.max(n, 1)) * i - 90 + (n === 1 ? 0 : 0);
    return <div className={`sp-stage sp-stage-${L}`} aria-label={design.stageLabel}>
      <div className="sp-orbit"><div className="sp-orbit-core" aria-hidden="true"><span>{s.icon}</span><strong>{arc ? 'You' : 'Portfolio'}</strong></div>
        {inner.map((x, i) => <div key={`i${i}`} className="sp-orb sp-orb-in" style={{ ['--a' as string]: `${ang(i, inner.length)}deg` } as CSSProperties}>{obj(x.t, x.i)}</div>)}
        {outer.map((x, i) => <div key={`o${i}`} className="sp-orb sp-orb-out" style={{ ['--a' as string]: `${ang(i, outer.length) + (arc ? 0 : 30)}deg` } as CSSProperties}>{go(x.n, 'sp-moon')}</div>)}</div>{detail}</div>; }

  if (L === 'mentorship') return <div className="sp-stage sp-stage-mentorship" aria-label={design.stageLabel}>
    <div className="sp-pair"><div className="sp-person" aria-label="You"><span aria-hidden="true">{s.icon}</span><strong>You</strong></div>
      <div className="sp-stones">{s.tools.map(obj)}</div>
      <div className="sp-person sp-person-other" aria-label="Someone you mentor"><span aria-hidden="true">🌱</span><strong>Someone you mentor</strong></div></div>
    <div className="sp-exits" aria-label="Places">{s.nav.map((n) => go(n, 'sp-exit'))}</div>{detail}</div>;

  if (L === 'impact') { const pos = [[12, 28], [34, 62], [58, 24], [76, 58], [46, 44], [88, 30], [22, 74]]; const pins = [...s.tools.map((t, i) => ({ t, i, n: null as null | { id: string; label: string; href: string } })), ...s.nav.map((n, i) => ({ t: null as Tool | null, i: s.tools.length + i, n }))];
    return <div className="sp-stage sp-stage-impact" aria-label={design.stageLabel}>
      <div className="sp-map">{pins.map((p, k) => <div key={k} className="sp-pin-slot" style={{ left: `${pos[k % pos.length]![0]}%`, top: `${pos[k % pos.length]![1]}%` }}>{p.t ? obj(p.t, p.i) : go(p.n!, 'sp-mappin')}</div>)}</div>{detail}</div>; }

  // commons: a hub with everything it connects to arranged around it
  const nodes = [...s.tools.map((t) => ({ kind: 'tool' as const, t })), ...s.nav.map((n) => ({ kind: 'nav' as const, n }))];
  return <div className="sp-stage stage-commons" aria-label={design.stageLabel}>
    <div className="sp-hub" style={{ ['--count' as string]: nodes.length } as CSSProperties}>
      <div className="sp-hub-core" aria-hidden="true"><span>{s.icon}</span><strong>{s.label}</strong></div>
      {nodes.map((n, i) => <div key={i} className="sp-hub-slot" style={{ ['--a' as string]: `${(360 / nodes.length) * i - 90}deg` } as CSSProperties}><span className="sp-hub-spoke" aria-hidden="true" /><div className="sp-hub-node">{n.kind === 'tool' ? obj(n.t, i) : go(n.n, 'sp-hub-link')}</div></div>)}
    </div>{detail}</div>;
}
