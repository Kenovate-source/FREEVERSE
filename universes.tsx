import { useState } from 'react';
import { api } from '../api/client';
import { Link, setQuery } from '../lib/router';
import { Async, Badge, Button, Card, Chip, EmptyState, Notice, PageHead, TextField, useResource } from '../ui/kit';
import { FeedList } from '../features/posts';
import { PostCard } from '../features/posts';
import { TemplateComposer } from '../features/universe/composer';
import { renderTool } from '../features/universe/tools';
import { specFor, type Space, type Template } from '../../shared/universe-spaces';
import type { FeedResponse } from '../../shared/api/content';
import type { UniverseView } from '../../shared/api/catalog';

type P = { params: Record<string, string>; query: URLSearchParams };
const STATUS_TONE = (s: string) => (s === 'available' ? 'ok' : s === 'partial' ? 'cyan' : undefined) as 'ok' | 'cyan' | undefined;

const GROUPS: { label: string; blurb: string; ids: string[] }[] = [
  { label: 'Connect', blurb: 'People, events and giving time.', ids: ['freeconnect', 'freeevents', 'freevolunteer'] },
  { label: 'Learn & discover', blurb: 'Learning, research and understanding.', ids: ['freelearn', 'freeresearch', 'freeai'] },
  { label: 'Work & build', blurb: 'Careers, ventures, markets and money.', ids: ['freework', 'freebuild', 'freemarket', 'freefinance'] },
  { label: 'Create & play', blurb: 'Make things, share them, have fun.', ids: ['freemedia', 'freeentertainment', 'freeplay', 'freelabs'] },
  { label: 'Well-being', blurb: 'Looking after yourself.', ids: ['freehealth'] },
];

export function UniversesPage(_: P) {
  const res = useResource(() => api.get<{ items: UniverseView[] }>('/api/universes'), []); const [q, setQ] = useState('');
  return <div className="stack-lg"><PageHead title="Universes">Fifteen connected spaces inside one FREEVERSE. Each has its own things to do, and each says plainly what it can’t do yet.</PageHead>
    <TextField label="Find a Universe" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “games”, “money” or “research”" />
    <Async res={res}>{(d) => { const ql = q.trim().toLowerCase(); const match = (u: UniverseView) => !ql || `${u.name} ${u.tagline} ${u.description} ${u.today.join(' ')}`.toLowerCase().includes(ql);
      const shown = d.items.filter(match); if (!shown.length) return <EmptyState icon="search" title="No Universe matches that">Try a different word, or clear the search.</EmptyState>;
      return <>{GROUPS.map((g) => { const items = g.ids.map((id) => shown.find((u) => u.id === id)).filter(Boolean) as UniverseView[]; if (!items.length) return null;
        return <section key={g.label} className="stack" aria-labelledby={`g-${g.label}`}><div><h2 id={`g-${g.label}`} className="h-md">{g.label}</h2><p className="muted">{g.blurb}</p></div>
          <div className="grid-cards">{items.map((u) => <Card as="article" key={u.id} className="uni-card" style={{ ['--accent' as string]: u.accent }}><div className="spread"><h3 className="h-sm"><Link to={`/universes/${u.id}`}>{u.name}</Link></h3><Badge tone={STATUS_TONE(u.status)}>{u.statusLabel}</Badge></div><p className="muted">{u.tagline}</p><ul className="tight">{u.today.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul><Link className="btn btn-secondary btn-sm" to={`/universes/${u.id}`}>Open {u.name}</Link></Card>)}</div></section>; })}</>; }}</Async></div>;
}

function Overview({ u, spec }: { u: UniverseView; spec: NonNullable<ReturnType<typeof specFor>> }) {
  const stats = useResource(() => api.get<{ templates: Record<string, number>; contributors: number }>(`/api/universes/${u.id}/stats`), [u.id]);
  const latest = useResource(() => (spec.templates.length ? api.get<FeedResponse>(`/api/feed?universe=${u.id}&sort=recent&limit=3`) : Promise.resolve({ items: [], nextCursor: null } as unknown as FeedResponse)), [u.id]);
  const all = useResource(() => api.get<{ items: UniverseView[] }>('/api/universes'), []);
  return <div className="stack-lg">
    <p className="prose">{u.description}</p>{u.note && <Notice>{u.note}</Notice>}
    <div className="row-wrap">{spec.actions.map((a) => <Link key={a.label} to={a.to} className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`}>{a.label}</Link>)}</div>
    <section className="stack" aria-labelledby="do"><h2 id="do" className="h-md">What you can do here</h2>
      <div className="grid-cards">{spec.spaces.filter((s) => s.type !== 'overview').map((s) => { const tpls = (s.templates ?? []).map((t) => spec.templates.find((x) => x.id === t)!).filter(Boolean); const n = tpls.reduce((a, t) => a + (stats.data?.templates[t.id] ?? 0), 0);
        return <Card as="article" key={s.id} className="stack-sm"><h3 className="h-sm"><Link to={s.type === 'link' ? s.to! : `/universes/${u.id}/${s.id}`}>{s.label}</Link></h3><p className="muted">{s.blurb ?? tpls.map((t) => t.blurb)[0] ?? ''}</p>{s.type === 'browse' && <p className="faint">{n} item{n === 1 ? '' : 's'} so far</p>}</Card>; })}</div></section>
    {spec.templates.length > 0 && <section className="stack" aria-labelledby="latest"><div className="spread"><h2 id="latest" className="h-md">Latest</h2>{stats.data && <span className="faint">{stats.data.contributors} contributor{stats.data.contributors === 1 ? '' : 's'}</span>}</div>
      <Async res={latest} empty={(d) => (d.items.length ? null : <EmptyState icon="inbox" title="Nothing here yet">Be the first to add something.</EmptyState>)}>{(d) => <>{d.items.map((p) => <PostCard key={p.id} post={p} />)}</>}</Async></section>}
    <Card className="stack-sm"><h2 className="h-sm">What this Universe doesn’t do</h2><ul>{spec.limits.map((l) => <li key={l}>{l}</li>)}</ul><p className="faint">Why it’s listed this way: {u.basis}</p></Card>
    <section className="stack-sm" aria-labelledby="rel"><h2 id="rel" className="h-sm">Related Universes</h2><Async res={all}>{(d) => <div className="row-wrap">{spec.related.map((r) => { const x = d.items.find((i) => i.id === r); return x ? <Link key={r} to={`/universes/${r}`} className="chip chip-link">{x.name}</Link> : null; })}</div>}</Async></section>
  </div>;
}

function Browse({ uid, space, spec, query }: { uid: string; space: Space; spec: NonNullable<ReturnType<typeof specFor>>; query: URLSearchParams }) {
  const tpls = (space.templates ?? []).map((t) => spec.templates.find((x) => x.id === t)).filter(Boolean) as Template[];
  const cur = tpls.find((t) => t.id === query.get('t')) ?? tpls[0]!; const facet = query.get('f') ?? ''; const mine = query.get('mine') === '1';
  const [composing, setComposing] = useState<string | null>(query.get('new')); const [tick, setTick] = useState(0);
  const filterField = cur.fields.find((f) => f.key === cur.filterField);
  const ids = tpls.map((t) => t.id).join(',');
  return <div className="stack">
    {tpls.length > 1 && <div className="row-wrap" role="group" aria-label="Kind">{tpls.map((t) => <Chip key={t.id} on={t.id === cur.id} onClick={() => setQuery({ t: t.id, f: null })}>{t.label}</Chip>)}</div>}
    <div className="spread"><p className="muted">{cur.blurb}</p><Button variant="primary" onClick={() => setComposing(cur.id)}>{cur.verb}</Button></div>
    {composing && (composing === cur.id || tpls.some((t) => t.id === composing)) && <TemplateComposer universe={uid} template={tpls.find((t) => t.id === composing) ?? cur} onClose={() => { setComposing(null); setQuery({ new: null }); }} onPosted={() => { setComposing(null); setQuery({ new: null }); setTick((x) => x + 1); }} />}
    {filterField?.options && <div className="row-wrap" role="group" aria-label={`Filter by ${filterField.label}`}><Chip on={!facet} onClick={() => setQuery({ f: null })}>All</Chip>{filterField.options.map((o) => <Chip key={o} on={facet === o} onClick={() => setQuery({ f: facet === o ? null : o })}>{o}</Chip>)}</div>}
    <div className="row-wrap"><Chip on={mine} onClick={() => setQuery({ mine: mine ? null : '1' })}>Only mine</Chip></div>
    <FeedList key={`${tick}|${cur.id}`} query={{ universe: uid, template: ids && tpls.length > 1 ? cur.id : ids, facet: facet || undefined, mine: mine ? '1' : undefined, sort: 'recent' }} />
  </div>;
}

export function UniversePage({ params, query }: P) {
  const res = useResource(() => api.get<{ items: UniverseView[] }>('/api/universes'), []); const spec = specFor(params.id ?? '');
  const spaceId = params.space ?? 'overview';
  return <Async res={res}>{(d) => { const u = d.items.find((x) => x.id === params.id);
    if (!u || !spec) return <EmptyState icon="grid" title="Universe not found"><Link to="/universes">All Universes</Link></EmptyState>;
    const space = spec.spaces.find((s) => s.id === spaceId);
    return <div className="stack-lg uni-page" style={{ ['--accent' as string]: u.accent }}>
      <header className="uni-hero"><div className="stack-sm"><Link to="/universes" className="faint">← All Universes</Link><h1 id="page-title" tabIndex={-1} className="h-xl">{u.name}</h1><p className="lead">{u.tagline}</p><div className="row-wrap"><Badge tone={STATUS_TONE(u.status)}>{u.statusLabel}</Badge></div></div></header>
      <nav className="row-wrap uni-tabs" aria-label={`${u.name} sections`}>{spec.spaces.map((s) => <Link key={s.id} to={s.type === 'link' ? s.to! : s.id === 'overview' ? `/universes/${u.id}` : `/universes/${u.id}/${s.id}`} className={`chip chip-link${s.id === spaceId ? ' on' : ''}`} aria-current={s.id === spaceId ? 'page' : undefined}>{s.label}{s.type === 'link' ? ' ↗' : ''}</Link>)}</nav>
      {!space ? <EmptyState icon="compass" title="That section doesn’t exist"><Link to={`/universes/${u.id}`}>Back to {u.name}</Link></EmptyState>
        : space.type === 'overview' ? <Overview u={u} spec={spec} />
        : space.type === 'browse' ? <Browse uid={u.id} space={space} spec={spec} query={query} />
        : space.type === 'tool' ? <>{renderTool(space.tool!, u.id, query)}</>
        : <Card className="stack-sm"><h2 className="h-sm">{space.label}</h2><p className="muted">{space.blurb}</p><Link to={space.to!} className="btn btn-primary" style={{ justifySelf: 'start' }}>Open</Link></Card>}
      {space && space.type !== 'overview' && <p className="faint">{spec.limits[0]}</p>}
    </div>; }}</Async>;
}
