// The Founder's living ecosystem map and the five views beneath it.
// Every figure comes from the overview the server computed, or from the Universe definitions in shared/.
// Particles show that a relationship exists and, for citizen activity only, scale with real 7-day counts. Nothing is simulated traffic.
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from '../lib/router';
import { Badge, Card } from '../ui/kit';
import { useMotion } from '../motion/react';
import { KINDS, W, H, buildMap, relationMatrix, universeImpact, isLive, type LinkKind, type MapLink, type MapNode } from '../lib/ecosystem';

interface Area { id: string; label: string; value: string; level: 'calm' | 'watch' | 'act'; caption: string }
const STATUS_WORD: Record<string, string> = { available: 'Available', partial: 'Partly built', planned_v2: 'Planned', planned_v3: 'Planned', concept: 'Idea only', under_review: 'Under review' };
const LEVEL_WORD = { calm: 'Calm', watch: 'Worth a look', act: 'Needs you' };

const pathFor = (a: MapNode, b: MapNode, kind: LinkKind) => {
  if (kind !== 'universe') return `M${a.x} ${a.y} L${b.x} ${b.y}`;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const dx = b.x - a.x, dy = b.y - a.y; const k = 0.18;
  return `M${a.x} ${a.y} Q${mx - dy * k + (450 - mx) * 0.25} ${my + dx * k + (310 - my) * 0.25} ${b.x} ${b.y}`;
};

function Particles({ link, d, level, colour }: { link: MapLink; d: string; level: 'full' | 'less'; colour: string }) {
  const n = level === 'less' ? 1 : Math.max(1, link.particles); const base = (link.kind === 'safety' ? 5.5 : link.kind === 'decision' ? 4.2 : link.kind === 'universe' ? 6.5 : 3.6) * (level === 'less' ? 2.4 : 1);
  const out: React.ReactElement[] = [];
  for (let i = 0; i < n; i++) {
    out.push(<circle key={`f${i}`} r={link.kind === 'citizen' ? 3.6 : 3} fill={colour} className="ef-particle"><animateMotion dur={`${base}s`} begin={`-${(base / n) * i}s`} repeatCount="indefinite" path={d} /></circle>);
    if (link.both) out.push(<circle key={`b${i}`} r={2.6} fill={colour} className="ef-particle"><animateMotion dur={`${base * 1.15}s`} begin={`-${(base / n) * i + 1}s`} repeatCount="indefinite" path={d} keyPoints="1;0" keyTimes="0;1" calcMode="linear" /></circle>);
  }
  return <>{out}</>;
}

export function LiveEcosystem({ o, areas, sel, onSelect }: { o: any; areas: Area[]; sel: string | null; onSelect: (id: string | null) => void }) {
  const { level: lv } = useMotion(); const level = lv; const [hidden, setHidden] = useState<Set<LinkKind>>(new Set()); const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ z: 1, x: W / 2, y: H / 2 }); const drag = useRef<{ x: number; y: number } | null>(null);
  const map = useMemo(() => buildMap(areas, o.universes, o.platform), [areas, o.universes, o.platform]);
  const byId = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map]);
  const focus = hover ?? sel; const near = useMemo(() => { const s = new Set<string>(); if (focus) { s.add(focus); for (const l of map.links) { if (l.kind === 'contains') continue; if (l.from === focus) s.add(l.to); if (l.to === focus) s.add(l.from); } } return s; }, [focus, map]);
  const vw = W / view.z, vh = H / view.z; const vx = Math.min(W - vw, Math.max(0, view.x - vw / 2)), vy = Math.min(H - vh, Math.max(0, view.y - vh / 2));
  const toggle = (k: LinkKind) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const zoomTo = (id: string | null) => { const n = id ? byId.get(id) : null; setView(n ? { z: 1.35, x: n.x, y: n.y } : { z: 1, x: W / 2, y: H / 2 }); };
  const pick = (id: string) => { const next = sel === id ? null : id; onSelect(next); zoomTo(next); };
  const key = (id: string) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); } };
  const animate = level !== 'off';
  return <figure className="ef">
    <div className="ef-legend" role="group" aria-label="Legend. Each entry shows or hides one kind of connection.">
      {KINDS.map((k) => <button key={k.id} type="button" className="ef-key" aria-pressed={!hidden.has(k.id)} onClick={() => toggle(k.id)} title={k.means}><span className="ef-swatch" style={{ background: k.colour }} aria-hidden="true" />{k.label}</button>)}
      <span className="ef-key-note"><span className="ef-dot on" aria-hidden="true" /> active <span className="ef-dot" aria-hidden="true" /> not available yet</span>
    </div>
    <div className="ef-tools" role="group" aria-label="Zoom">
        <button type="button" className="btn btn-secondary btn-sm" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, z: Math.min(2.6, v.z + 0.4) }))}>＋</button>
        <button type="button" className="btn btn-secondary btn-sm" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, z: Math.max(1, v.z - 0.4) }))}>－</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onSelect(null); zoomTo(null); }}>Reset</button>
    </div>
    <div className="ef-stage">
      <svg className="ef-svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} role="group" aria-label="Ecosystem map. Seven operating areas in the middle ring, fifteen Universes on the outer ring. Use Tab to move between them."
        onPointerDown={(e) => { if ((e.target as Element).closest('.ef-node')) return; drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drag.current || view.z === 1) return; const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const dx = ((e.clientX - drag.current.x) / r.width) * vw, dy = ((e.clientY - drag.current.y) / r.height) * vh; drag.current = { x: e.clientX, y: e.clientY }; setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy })); }}
        onPointerUp={() => { drag.current = null; }}>
        <ellipse cx={450} cy={310} rx={165} ry={118} className="ef-ring" /><ellipse cx={450} cy={310} rx={385} ry={262} className="ef-ring" />
        {map.links.map((l) => { if (hidden.has(l.kind)) return null; const a = byId.get(l.from)!, b = byId.get(l.to)!; const kind = KINDS.find((k) => k.id === l.kind)!; const d = pathFor(a, b, l.kind); const hl = !!focus && (l.from === focus || l.to === focus) && l.kind !== 'contains'; const lit = !focus || (near.has(l.from) && near.has(l.to) && (l.from === focus || l.to === focus));
          return <g key={l.id} className={`ef-link k-${l.kind}${l.active ? ' on' : ' off'}${lit ? '' : ' dim'}${hl ? ' hl' : ''}`}>
            <path d={d} stroke={kind.colour} className="ef-path" />{animate && l.active && l.particles > 0 && lit && <Particles link={l} d={d} level={level} colour={kind.colour} />}</g>; })}
        {map.nodes.map((n) => { const dim = focus && !near.has(n.id); const sw = n.id === sel;
          if (n.id === 'core') return <g key="core" className="ef-core" aria-hidden="true"><circle cx={n.x} cy={n.y} r={34} /><text x={n.x} y={n.y + 4} textAnchor="middle">FREEVERSE</text></g>;
          const label = n.ring === 'area' ? `${n.label}: ${n.value} ${areas.find((a) => a.id === n.id)?.caption ?? ''}. ${LEVEL_WORD[n.level!]}.` : `${n.label}. ${STATUS_WORD[n.status ?? ''] ?? n.status}. ${n.active ? 'Active' : 'Not available yet'}.`;
          return <g key={n.id} className={`ef-node ${n.ring}${n.active ? ' on' : ' off'}${sw ? ' sel' : ''}${dim ? ' dim' : ''}${n.level ? ` lv-${n.level}` : ''}`} tabIndex={0} role="button" aria-pressed={sw} aria-label={label} onClick={() => pick(n.id)} onKeyDown={key(n.id)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}>
            {n.ring === 'area' ? <><rect x={n.x - 56} y={n.y - 26} width={112} height={52} rx={14} className="ef-box" />{n.level === 'act' && animate && <rect x={n.x - 56} y={n.y - 26} width={112} height={52} rx={14} className="ef-pulse" />}
              <text x={n.x} y={n.y - 6} textAnchor="middle" className="ef-name">{n.label}</text><text x={n.x} y={n.y + 15} textAnchor="middle" className="ef-val">{n.value}</text></>
              : <><circle cx={n.x} cy={n.y} r={15} fill={n.active ? n.accent : 'transparent'} stroke={n.accent} className="ef-udot" />{n.active && animate && <circle cx={n.x} cy={n.y} r={15} stroke={n.accent} className="ef-ripple" />}
                <text x={n.x} y={n.y + (n.y < 310 ? -22 : 32)} textAnchor="middle" className="ef-ulabel">{n.label}</text></>}
          </g>; })}
      </svg>
    </div>
    <figcaption className="faint ef-cap">Colour is always paired with words. Particles on citizen links scale with the last 7 days of real posts and comments ({o.platform.find((p: any) => p.key === 'posts_7d')?.value ?? 0} posts, {o.platform.find((p: any) => p.key === 'comments_7d')?.value ?? 0} comments). Other links show that a relationship exists; they don’t measure traffic. {'On a phone, swipe sideways to see the whole map. '}{animate ? '' : 'Motion is off, so particles are hidden; lines and states still show.'}</figcaption>
  </figure>;
}

export function UniversePanel({ o, id, onClose }: { o: any; id: string; onClose: () => void }) {
  const u = o.universes.find((x: any) => x.id === id); const im = universeImpact(id); if (!u) return null;
  const list = (xs: { id: string; name: string }[]) => (xs.length ? xs.map((x) => x.name).join(', ') : 'none');
  return <Card className="stack-sm ctx" as="section" aria-labelledby="uni-h"><div className="spread"><h2 id="uni-h" className="h-md">{u.name}</h2><Badge tone={isLive(u.status) ? 'ok' : 'violet'}>{STATUS_WORD[u.status] ?? u.status}</Badge></div>
    <p>{isLive(u.status) ? 'Members can use this Universe today.' : 'Members can’t use this Universe yet, so nothing flows through it.'}</p>
    <dl className="kv"><div className="kv-row"><dt>Points its members to</dt><dd><strong>{list(im.pointsTo)}</strong></dd></div><div className="kv-row"><dt>Members are pointed here from</dt><dd><strong>{list(im.pointedFromBy)}</strong></dd></div></dl>
    <p className="faint">If you pause or change {u.name}: {im.pointedFromBy.length ? `${list(im.pointedFromBy)} would still suggest it to members, so check that wording first.` : 'no other Universe suggests it.'} Basis for its status: {u.basis}</p>
    <div className="row-wrap"><Link to="/founder/universes" className="btn btn-primary btn-sm">Open Universe administration</Link><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></div></Card>;
}

const Section = ({ id, title, lede, children }: { id: string; title: string; lede: string; children: React.ReactNode }) => <section aria-labelledby={id} className="stack-sm ev-sec"><h3 id={id} className="h-md">{title}</h3><p className="muted">{lede}</p>{children}</section>;

export function EcosystemViews({ o, areas }: { o: any; areas: Area[] }) {
  const unis = o.universes as { id: string; name: string; status: string }[]; const mat = relationMatrix(unis); const p = (k: string) => Number(o.platform.find((x: any) => x.key === k)?.value ?? 0); const m = (k: string) => Number(o.moderation.find((x: any) => x.key === k)?.value ?? 0);
  const openCases = ['crisis', 'high', 'normal', 'low'].reduce((n, k) => n + m(`cases_${k}`), 0);
  const flow = [{ l: 'Active members', v: p('members_active'), w: 'now' }, { l: 'Posts', v: p('posts_7d'), w: 'last 7 days' }, { l: 'Comments', v: p('comments_7d'), w: 'last 7 days' }, { l: 'Reports', v: m('reports_30d'), w: 'last 30 days' }, { l: 'Open cases', v: openCases, w: 'now' }, { l: 'Open appeals', v: m('appeals_open'), w: 'now' }];
  const j = o.journey as { key: string; label: string; value: number }[]; const top = Math.max(1, j[0]?.value ?? 1);
  const hubs = unis.map((u) => ({ ...u, in: universeImpact(u.id).pointedFromBy.length, out: universeImpact(u.id).pointsTo.length })).sort((a, b) => b.in - a.in);
  const sp = o.council.specialists as any[]; const c = (k: string) => Number(o.security.find((x: any) => x.key === k)?.value ?? 0);
  return <div className="stack-lg ev">
    <Section id="ev-a" title="A. How the Universes relate" lede="Row points to column. This is each Universe’s own list of related Universes, so it shows where members are sent next. It is not usage data.">
      <div className="ev-scroll"><table className="ev-matrix"><caption className="sr-only">Universe relationship matrix. A mark means the row Universe points its members to the column Universe.</caption>
        <thead><tr><th scope="col"><span className="sr-only">From</span></th>{mat.map((r) => <th key={r.id} scope="col"><span className="ev-vert">{r.name.replace('Free', '')}</span></th>)}</tr></thead>
        <tbody>{mat.map((r) => <tr key={r.id}><th scope="row">{r.name}</th>{r.cells.map((cell) => <td key={cell.id} className={cell.on ? (cell.mutual ? 'mutual' : 'one') : ''}>{cell.on ? <span aria-label={`${r.name} points to ${cell.name}${cell.mutual ? ', and back' : ''}`}>{cell.mutual ? '⇄' : '→'}</span> : null}</td>)}</tr>)}</tbody></table></div>
      <p className="faint">⇄ they point to each other · → one way.</p></Section>
    <Section id="ev-b" title="B. Activity and information flow" lede="Real counts, left to right along the path a citizen’s activity takes. The windows differ, so these aren’t percentages of each other.">
      <ol className="plain ev-flow">{flow.map((f, i) => <li key={f.l}><span className="ev-fnum">{f.v}</span><span className="ev-fl">{f.l}</span><span className="faint">{f.w}</span>{i < flow.length - 1 && <span className="ev-arrow" aria-hidden="true">→</span>}</li>)}</ol></Section>
    <Section id="ev-c" title="C. Citizen journey" lede="How many of today’s members have reached each step. Counts include fictional demo members when demo data is on.">
      <ul className="plain stack-sm">{j.map((s) => <li key={s.key} className="ev-bar"><div className="spread"><span>{s.label}</span><strong>{s.value} <span className="faint">({Math.round((s.value / top) * 100)}%)</span></strong></div><div className="ev-track" role="img" aria-label={`${Math.round((s.value / top) * 100)} percent`}><span style={{ width: `${Math.round((s.value / top) * 100)}%` }} /></div></li>)}</ul>
      <p className="faint">{p('members_pending')} account(s) are waiting at the eligibility check. Percentages are of everyone who created an account and wasn’t deleted.</p></Section>
    <Section id="ev-d" title="D. Shared resources and connections" lede="What every Universe stands on, and which Universes the others lean on most.">
      <div className="grid-2"><Card className="stack-sm"><h4 className="h-sm">Shared by every Universe</h4><dl className="kv">
        <div className="kv-row"><dt>Communities</dt><dd><strong>{p('communities')}</strong></dd></div><div className="kv-row"><dt>Moderators</dt><dd><strong>{m('moderators')}</strong></dd></div><div className="kv-row"><dt>Live role grants</dt><dd><strong>{c('grants_live')}</strong></dd></div>
        <div className="kv-row"><dt>AI Council specialists available</dt><dd><strong>{sp.filter((a) => a.available).length}/{sp.length}</strong></dd></div></dl><p className="faint">Accounts, identity, safety reporting and the audit log serve all Universes the same way.</p></Card>
        <Card className="stack-sm"><h4 className="h-sm">Most pointed-to Universes</h4><ol className="ev-hubs">{hubs.slice(0, 6).map((h) => <li key={h.id}><span>{h.name}</span><strong>{h.in} point here</strong>{!isLive(h.status) && <Badge tone="violet">not available yet</Badge>}</li>)}</ol></Card></div></Section>
    <Section id="ev-e" title="E. Ecosystem health" lede="Each part’s state, and the plain reason it has that state. These are the same rules as the map; nothing is a score.">
      <ul className="plain stack-sm">{areas.map((a) => <li key={a.id} className="ev-health"><Badge tone={a.level === 'act' ? 'warn' : a.level === 'watch' ? 'violet' : 'ok'}>{LEVEL_WORD[a.level]}</Badge> <strong>{a.label}</strong> <span className="muted">{a.value} {a.caption}</span></li>)}</ul>
      <dl className="kv"><div className="kv-row"><dt>Denied sensitive attempts, 7 days</dt><dd><strong>{c('denied_7d')}</strong></dd></div><div className="kv-row"><dt>Failed re-authentication, 7 days</dt><dd><strong>{c('stepup_fail_7d')}</strong></dd></div><div className="kv-row"><dt>Database changes applied</dt><dd><strong>{o.config.migrationsApplied}</strong></dd></div><div className="kv-row"><dt>Founder AI model</dt><dd><strong>{o.config.ai === 'demo' ? 'Demo (no model connected)' : 'Connected'}</strong></dd></div></dl></Section>
  </div>;
}
