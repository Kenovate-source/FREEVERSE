import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { Link, navigate } from '../lib/router';
import { Async, Badge, Button, Card, Notice, useResource } from '../ui/kit';
import { timeAgo } from '../lib/time';

type Level = 'calm' | 'watch' | 'act';
interface Metric { key: string; label: string; value: number | string; note?: string }
export interface Node { id: string; label: string; value: string; caption: string; level: Level; why: string; rows: { label: string; value: string | number }[]; actions: { label: string; to: string }[]; angle: number; basis: string }

const num = (rows: Metric[], k: string) => Number(rows.find((r) => r.key === k)?.value ?? 0);
const LEVEL_TEXT: Record<Level, string> = { calm: 'Calm', watch: 'Worth a look', act: 'Needs you' };

/** Builds the map from real overview data. Each node states why it has its level; nothing here is estimated. */
export function buildNodes(o: any): Node[] {
  const p = o.platform as Metric[]; const mod = o.moderation as Metric[]; const sec = o.security as Metric[]; const a = o.attention;
  const overdue = num(mod, 'cases_overdue'); const crisis = num(mod, 'cases_crisis'); const open = ['crisis', 'high', 'normal', 'low'].reduce((n, k) => n + num(mod, `cases_${k}`), 0);
  const pending = o.pendingDecisions.length; const reviewOpen = o.accessReview.open;
  const lvl = (act: boolean, watch: boolean): Level => (act ? 'act' : watch ? 'watch' : 'calm');
  return [
    { id: 'citizens', label: 'Citizens', value: String(num(p, 'members_active')), caption: 'active members', angle: -90, level: lvl(false, num(p, 'members_pending') > 0), basis: 'Watch when accounts are waiting for the eligibility check.',
      why: num(p, 'members_pending') ? `${num(p, 'members_pending')} account(s) haven’t finished the eligibility check.` : 'Nothing is waiting.', rows: [{ label: 'New accounts, 7 days', value: num(p, 'signups_7d') }, { label: 'Awaiting eligibility', value: num(p, 'members_pending') }, { label: 'Suspended', value: num(p, 'members_suspended') }], actions: [] },
    { id: 'communities', label: 'Communities', value: String(num(p, 'communities')), caption: 'active communities', angle: -38, level: 'calm', basis: 'Calm unless a community has open safety cases (see Safety).',
      why: `${num(p, 'posts_7d')} posts and ${num(p, 'comments_7d')} comments in the last 7 days.`, rows: [{ label: 'Posts, 7 days', value: num(p, 'posts_7d') }, { label: 'Comments, 7 days', value: num(p, 'comments_7d') }], actions: [{ label: 'Open communities workspace', to: '/founder/communities' }] },
    { id: 'universes', label: 'Universes', value: `${a.universesLive}/${a.universesTotal}`, caption: 'with something to use', angle: 14, level: 'calm', basis: 'Counts Universes whose status is Available or Partial.',
      why: 'Each Universe states honestly what it can and can’t do yet.', rows: o.universes.slice(0, 15).map((u: any) => ({ label: u.name, value: u.status })), actions: [{ label: 'Open Universe administration', to: '/founder/universes' }] },
    { id: 'safety', label: 'Safety', value: String(open), caption: 'open cases', angle: 66, level: lvl(overdue > 0 || crisis > 0, open > 0), basis: 'Needs you when any case is past its target time or marked crisis; worth a look when any case is open.',
      why: overdue ? `${overdue} case(s) are past their target time.` : crisis ? `${crisis} crisis case(s) are open.` : open ? `${open} case(s) are open and within target.` : 'No open cases.', rows: [{ label: 'Past target time', value: overdue }, { label: 'Open appeals', value: num(mod, 'appeals_open') }, { label: 'Reports, 30 days', value: num(mod, 'reports_30d') }, { label: 'Denied sensitive attempts, 7 days', value: num(sec, 'denied_7d') }], actions: [{ label: 'Open the moderation queue', to: '/moderation' }] },
    { id: 'governance', label: 'Governance', value: String(pending), caption: 'decisions waiting', angle: 118, level: lvl(pending > 0, reviewOpen > 0), basis: 'Needs you when a proposal is awaiting your approval; worth a look when an access review is open.',
      why: pending ? `${pending} proposal(s) are waiting for your approval.` : reviewOpen ? `${reviewOpen} access review(s) are open.` : 'Nothing is waiting.', rows: o.governance.map((g: any) => ({ label: `${g.name} seats`, value: `${g.filled}/${g.seats}` })), actions: [{ label: 'Decisions', to: '/founder/decisions' }, { label: 'Access reviews', to: '/founder/access' }, { label: 'Governance workspace', to: '/founder/governance' }] },
    { id: 'ai', label: 'Founder AI', value: String(a.findingsOpen), caption: 'open findings', angle: 170, level: lvl(false, a.findingsOpen > 0), basis: 'Worth a look when it has findings you haven’t reviewed.',
      why: a.findingsOpen ? `${a.findingsOpen} finding(s) are waiting for review.` : 'No open findings.', rows: [{ label: 'Mode', value: String(o.founderAi.mode).replace('_', ' ') }, { label: 'Autonomy rules', value: o.founderAi.rules }, { label: 'Model', value: o.config.ai === 'demo' ? 'Demo (no model connected)' : 'Connected' }], actions: [{ label: 'Open the Founder AI workspace', to: '/founder/ai' }] },
    { id: 'suggestions', label: 'Suggestions', value: String(a.suggestionsNew), caption: 'not yet reviewed', angle: 222, level: lvl(false, a.suggestionsNew > 0), basis: 'Worth a look when citizens’ suggestions are still in “Submitted”.',
      why: a.suggestionsNew ? `${a.suggestionsNew} suggestion(s) haven’t been looked at.` : 'The queue is clear.', rows: [{ label: 'Not yet reviewed', value: a.suggestionsNew }], actions: [{ label: 'Open the suggestions queue', to: '/founder/suggestions' }] },
  ];
}

const POS = (angle: number, r: number) => ({ x: 50 + r * Math.cos((angle * Math.PI) / 180), y: 50 + r * 0.82 * Math.sin((angle * Math.PI) / 180) });
const LINKS: [string, string][] = [['communities', 'safety'], ['universes', 'communities'], ['ai', 'governance'], ['suggestions', 'universes'], ['citizens', 'communities'], ['safety', 'governance']];

function EcosystemMap({ nodes, sel, onSelect }: { nodes: Node[]; sel: string | null; onSelect: (id: string) => void }) {
  const pos = new Map(nodes.map((n) => [n.id, POS(n.angle, 36)]));
  return <div className="eco" role="group" aria-label="Ecosystem map. Each part shows a live figure and whether it needs attention.">
    <svg className="eco-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{nodes.map((n) => <line key={n.id} x1="50" y1="50" x2={pos.get(n.id)!.x} y2={pos.get(n.id)!.y} />)}{LINKS.map(([x, y]) => <line key={x + y} className="eco-rel" x1={pos.get(x)!.x} y1={pos.get(x)!.y} x2={pos.get(y)!.x} y2={pos.get(y)!.y} />)}</svg>
    <div className="eco-core" aria-hidden="true"><span>FREEVERSE</span></div>
    {nodes.map((n) => { const p = pos.get(n.id)!; return <button key={n.id} type="button" className={`eco-node lv-${n.level}${sel === n.id ? ' on' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-pressed={sel === n.id} onClick={() => onSelect(n.id)} aria-label={`${n.label}: ${n.value} ${n.caption}. ${LEVEL_TEXT[n.level]}.`}>
      <span className="eco-name">{n.label}</span><span className="eco-val">{n.value}</span><span className="eco-cap">{n.caption}</span>{n.level !== 'calm' && <span className="eco-flag">{LEVEL_TEXT[n.level]}</span>}</button>; })}
  </div>;
}

const humanAction = (a: string) => a.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function FounderHome() {
  const res = useResource(() => api.get<any>('/api/founder/overview'), []); const [sel, setSel] = useState<string | null>(null);
  return <Async res={res}>{(o) => {
    const nodes = buildNodes(o); const cur = nodes.find((n) => n.id === sel) ?? null;
    const needs: { text: string; to: string; level: Level }[] = [
      ...o.pendingDecisions.map((p: any) => ({ text: `Approve or decline: ${p.title}`, to: '/founder/decisions', level: 'act' as Level })),
      ...(nodes.find((n) => n.id === 'safety')!.level === 'act' ? [{ text: nodes.find((n) => n.id === 'safety')!.why, to: '/moderation', level: 'act' as Level }] : []),
      ...(o.accessReview.open ? [{ text: `${o.accessReview.open} access review(s) in progress`, to: '/founder/access', level: 'watch' as Level }] : []),
      ...(o.attention.findingsOpen ? [{ text: `${o.attention.findingsOpen} Founder AI finding(s) to review`, to: '/founder/ai', level: 'watch' as Level }] : []),
      ...(o.attention.suggestionsNew ? [{ text: `${o.attention.suggestionsNew} suggestion(s) to review`, to: '/founder/suggestions', level: 'watch' as Level }] : []),
    ];
    return <div className="stack-lg">
      <Notice>{o.dataNote} Generated {new Date(o.generatedAt).toLocaleTimeString()}. Colours always come with words, and each part explains why it has its level.</Notice>
      {o.config.ai === 'demo' && <Notice tone="demo" title="Demo mode">No AI model is connected, so Founder AI findings are computed directly from database counts, not generated by a model.</Notice>}
      <div className="console-grid">
        <section aria-labelledby="map-h"><h2 id="map-h" className="h-md">The ecosystem</h2><p className="muted">Select a part to open it here. Lines show parts that affect each other.</p>
          <EcosystemMap nodes={nodes} sel={sel} onSelect={(id) => setSel(sel === id ? null : id)} /></section>
        <aside className="stack" aria-label="Context" aria-live="polite">
          {cur ? <Card className="stack-sm ctx" as="section" aria-labelledby="ctx-h"><div className="spread"><h2 id="ctx-h" className="h-md">{cur.label}</h2><Badge tone={cur.level === 'act' ? 'warn' : cur.level === 'watch' ? 'violet' : 'ok'}>{LEVEL_TEXT[cur.level]}</Badge></div>
            <p>{cur.why}</p><dl className="kv">{cur.rows.map((r) => <div key={r.label} className="kv-row"><dt>{r.label}</dt><dd><strong>{r.value}</strong></dd></div>)}</dl>
            <p className="faint">How this level is decided: {cur.basis}</p><div className="row-wrap">{cur.actions.map((x) => <Link key={x.to} to={x.to} className="btn btn-primary btn-sm">{x.label}</Link>)}<Button size="sm" variant="ghost" onClick={() => setSel(null)}>Close</Button></div></Card>
            : <Card className="stack-sm"><h2 className="h-md">Needs you</h2>{needs.length === 0 ? <p className="muted">Nothing is waiting for you right now.</p> : <ul className="plain stack-sm">{needs.map((n, i) => <li key={i}><Link to={n.to}><Badge tone={n.level === 'act' ? 'warn' : 'violet'}>{LEVEL_TEXT[n.level]}</Badge> {n.text}</Link></li>)}</ul>}</Card>}
          <Card className="stack-sm"><h2 className="h-md">Recent activity</h2><p className="faint">From the audit log (it never stores private content).</p>
            {o.timeline.length === 0 ? <p className="muted">No recorded actions yet.</p> : <ol className="timeline">{o.timeline.map((t: any, i: number) => <li key={i}><span className="faint">{timeAgo(t.at, Date.now())}</span> {humanAction(t.action)}{t.by ? ` · @${t.by}` : ''}{t.outcome === 'denied' ? ' · denied' : ''}</li>)}</ol>}<Link to="/founder/audit">Open the full audit log</Link></Card>
        </aside></div></div>;
  }}</Async>;
}

const COMMANDS: { label: string; to: string; hint: string }[] = [
  { label: 'Overview', to: '/founder', hint: 'ecosystem map' }, { label: 'Founder AI workspace', to: '/founder/ai', hint: 'findings, proposals, delegation' }, { label: 'Decisions', to: '/founder/decisions', hint: 'proposals waiting for approval' },
  { label: 'Governance', to: '/founder/governance', hint: 'appointments and roles' }, { label: 'Access reviews', to: '/founder/access', hint: 'who can do what' }, { label: 'Suggestions', to: '/founder/suggestions', hint: 'citizens’ ideas' },
  { label: 'Communities', to: '/founder/communities', hint: 'health and oversight' }, { label: 'Universes', to: '/founder/universes', hint: 'status and configuration' }, { label: 'AI Council', to: '/founder/council', hint: 'specialists' },
  { label: 'Audit log', to: '/founder/audit', hint: 'recorded actions' }, { label: 'Constitution', to: '/founder/constitution', hint: 'the rules' }, { label: 'Priorities', to: '/founder/priorities', hint: 'your list' }, { label: 'Moderation queue', to: '/moderation', hint: 'cases and appeals' },
];

/** Persistent command surface. Press Ctrl/⌘+K (or “/” outside a field) anywhere in the console to jump to a workspace. */
export function CommandBar() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [i, setI] = useState(0); const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return COMMANDS.filter((c) => !t || `${c.label} ${c.hint}`.toLowerCase().includes(t)); }, [q]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { const tag = (e.target as HTMLElement)?.tagName; const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setOpen(true); } };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  const go = (to: string) => { setOpen(false); navigate(to); };
  return <div className="cmd"><Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K">Command bar <kbd>Ctrl K</kbd></Button>
    {open && <div className="cmd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}><div className="cmd-box" role="dialog" aria-modal="true" aria-label="Command bar">
      <input ref={input} className="input" role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={list[i] ? `cmd-${i}` : undefined} aria-label="Go to a workspace" placeholder="Where to? Try “access”, “ai” or “audit”" value={q}
        onChange={(e) => { setQ(e.target.value); setI(0); }} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); } else if (e.key === 'Enter' && list[i]) go(list[i]!.to); }} />
      <ul id="cmd-list" role="listbox" className="plain">{list.length === 0 ? <li className="muted" role="option" aria-selected="false">Nothing matches.</li> : list.map((c, n) => <li key={c.to} id={`cmd-${n}`} role="option" aria-selected={n === i} className={n === i ? 'on' : ''} onMouseEnter={() => setI(n)} onClick={() => go(c.to)}><strong>{c.label}</strong> <span className="faint">{c.hint}</span></li>)}</ul>
      <p className="faint">Enter to open · Esc to close</p></div></div>}</div>;
}
