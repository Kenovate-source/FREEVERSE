import { useMemo } from 'react';
import { api } from '../api/client';
import { Link, setQuery } from '../lib/router';
import { Async, Badge, Card, PageHead, useResource } from '../ui/kit';
import { SpaceStage } from '../features/space-stage';
import { SPACE_DESIGN, type ViewId } from '../../shared/space-design';
import type { SpaceView } from '../../shared/api/identity';

type P = { params: Record<string, string>; query: URLSearchParams };

/** An identity space: its own environment (backdrop plus arrangement), its own sections, the same real data as everywhere else. */
export function SpacePage({ params, query }: P) {
  const res = useResource(() => api.get<{ space: SpaceView }>(`/api/spaces/${params.archetype}`), [params.archetype]);
  return <Async res={res}>{({ space: s }) => <SpaceBody s={s} view={query.get('view')} />}</Async>;
}
function SpaceBody({ s, view }: { s: SpaceView; view: string | null }) {
  const design = SPACE_DESIGN[s.archetype]; const cur: ViewId = design.views.some((v) => v.id === view) ? (view as ViewId) : 'workspace';
  const earned = useMemo(() => s.achievements.filter((a) => a.earned).length, [s]);
  return <div className={`stack-lg space space--${design.layout} space--${s.archetype}`} data-space={s.archetype} style={{ ['--accent' as string]: s.accent }}>
    <PageHead title={`${s.icon} ${s.label} space`} back={{ to: '/identities', label: 'Identities' }}>{s.tagline}</PageHead>
    <nav aria-label={`${s.label} space sections`} className="space-tabs" role="tablist">{design.views.map((v) => <button key={v.id} type="button" role="tab" aria-selected={cur === v.id} className={`space-tab${cur === v.id ? ' on' : ''}`} onClick={() => setQuery({ view: v.id === 'workspace' ? null : v.id })}>{v.label}</button>)}</nav>
    <div role="tabpanel" aria-label={design.views.find((v) => v.id === cur)?.label}>
      {cur === 'workspace' && <SpaceStage s={s} design={design} />}
      {cur === 'tools' && <section className="stack" aria-label="Tools"><p className="muted">The same tools as the {design.stageLabel.toLowerCase()}, as a plain list.</p><ul className="plain stack-sm">{s.tools.map((t) => <li key={t.id}><Card as="article"><div className="spread"><h2 className="h-sm">{t.label}</h2>{t.status === 'available' ? <Badge tone="ok">Available</Badge> : <Badge>Planned</Badge>}</div><p className="muted">{t.description}</p>{t.status === 'available' && t.href ? <Link to={t.href} className="btn btn-ghost btn-sm">Open</Link> : <p className="faint">Not built yet.</p>}</Card></li>)}</ul></section>}
      {cur === 'entries' && <section className="stack" aria-label={design.views.find((v) => v.id === 'entries')?.label}>{s.sections.map((sec) => <Card key={sec.kind}><h2 className="h-sm">{sec.label}</h2>{sec.entries.length === 0 ? <p className="muted">{sec.prompt}. <Link to="/me/profile">Add it on your profile</Link></p> : <ul className="plain stack-sm">{sec.entries.map((e) => <li key={e.id}>{e.link ? <a href={e.link} rel="noopener noreferrer nofollow" target="_blank">{e.title}</a> : e.title} <Badge>{e.evidence === 'self_declared' ? 'Self-declared' : 'Recorded on FREEVERSE'}</Badge>{e.description && <div className="muted">{e.description}</div>}</li>)}</ul>}</Card>)}</section>}
      {cur === 'milestones' && <section className="stack" aria-label="Milestones"><p className="muted">{earned} of {s.achievements.length} earned. Only things recorded on FREEVERSE count.</p><ul className="plain stack-sm">{s.achievements.map((a) => <li key={a.id}><Card><strong>{a.label}</strong> {a.earned && <Badge tone="ok">Earned</Badge>}<div className="muted">{a.description}</div><div className="faint">{a.earned ? 'Done' : `${a.progress} of ${a.target}`}</div></Card></li>)}</ul></section>}
      {cur === 'go' && <section className="stack" aria-label="Destinations"><div className="grid-cards">{s.nav.map((n) => <Card key={n.id} as="article"><h2 className="h-sm"><Link to={n.href}>{n.label}</Link></h2></Card>)}</div></section>}
    </div>
  </div>;
}
