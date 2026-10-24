import { useState } from 'react';
import { api, qs } from '../api/client';
import { Link, setQuery } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Async, Badge, Button, Card, Chip, DemoBadge, EmptyState, Notice, PageHead, SelectField, TextArea, TextField, Seg, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { LEARN_FORMATS, LEARN_FORMAT_LABEL, OPP_TYPES, OPP_TYPE_LABEL, TRACK_STATUSES, type EventCard, type LearnBlock, type LearnCard, type LearnDetail, type LearnList, type MentorCard, type OpportunityCard, type TrackStatus } from '../../shared/api/catalog';
import type { SavedKind } from '../../shared/api/content';

type P = { params: Record<string, string>; query: URLSearchParams };
const TRACK_LABEL: Record<TrackStatus, string> = { interested: 'Interested', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', declined: 'Declined' };

export function SaveButton({ kind, refId, saved, onChange }: { kind: SavedKind; refId: string; saved: boolean; onChange?: (v: boolean) => void }) {
  const { say } = useToast(); const [on, setOn] = useState(saved);
  const t = async () => { try { if (on) await api.del(`/api/saved${qs({ kind, refId })}`); else await api.put('/api/saved', { kind, refId }); setOn(!on); onChange?.(!on); say(on ? 'Removed from Saved' : 'Saved'); } catch (e) { say(errMsg(e), 'error'); } };
  return <Button size="sm" variant="ghost" aria-pressed={on} onClick={() => void t()}><Icon name="bookmark" size={16} /> {on ? 'Saved' : 'Save'}</Button>;
}
const SearchBar = ({ label, q }: { label: string; q: string }) => { const [t, setT] = useState(q); return <form role="search" className="row-wrap" onSubmit={(e) => { e.preventDefault(); setQuery({ q: t || null }); }}><TextField label={label} value={t} onChange={(e) => setT(e.target.value)} /><Button type="submit">Search</Button></form>; };

// ───────── Learn ─────────
export function LearnPage({ query }: P) {
  const f = { q: query.get('q') ?? '', format: query.get('format') ?? '', category: query.get('category') ?? '', level: query.get('level') ?? '', saved: query.get('saved') ?? '', progress: query.get('progress') ?? '' };
  const res = useResource(() => api.get<LearnList>(`/api/learn${qs({ q: f.q || undefined, format: f.format || undefined, category: f.category || undefined, level: f.level || undefined, saved: f.saved || undefined, progress: f.progress || undefined })}`), [JSON.stringify(f)]);
  const set = (k: string, v: string) => setQuery({ [k]: v || null });
  return (
    <div className="stack-lg"><PageHead title="Learn">Articles, videos, courses, quizzes, challenges and more. Your progress is yours alone.</PageHead>
      <SearchBar label="Search Learn" q={f.q} />
      <div className="stack-sm"><div className="row-wrap" role="group" aria-label="Format"><Chip on={!f.format} onClick={() => set('format', '')}>All formats</Chip>{LEARN_FORMATS.map((x) => <Chip key={x} on={f.format === x} onClick={() => set('format', f.format === x ? '' : x)}>{LEARN_FORMAT_LABEL[x]}</Chip>)}</div>
        <div className="row-wrap"><SelectField label="Level" value={f.level} onChange={(e) => set('level', e.target.value)}><option value="">Any level</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></SelectField>
          <SelectField label="Topic" value={f.category} onChange={(e) => set('category', e.target.value)}><option value="">All topics</option>{res.data?.categories.map((c) => <option key={c.key} value={c.key}>{c.key} ({c.count})</option>)}</SelectField>
          <SelectField label="Show" value={f.saved ? 'saved' : f.progress} onChange={(e) => { const v = e.target.value; setQuery({ saved: v === 'saved' ? '1' : null, progress: v === 'in_progress' || v === 'completed' ? v : null }); }}><option value="">Everything</option><option value="saved">Saved</option><option value="in_progress">In progress</option><option value="completed">Completed</option></SelectField></div></div>
      <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="learn" title="Nothing matches">Try clearing a filter.</EmptyState>)}>{(d) => <>{d.notice && <Notice tone="demo">{d.notice}</Notice>}<p className="faint" aria-live="polite">{d.total} result{d.total === 1 ? '' : 's'}</p><div className="grid-cards">{d.items.map((i) => <LearnTile key={i.id} i={i} />)}</div></>}</Async>
    </div>
  );
}
function LearnTile({ i }: { i: LearnCard }) {
  return <Card as="article" className="learn-tile"><div className="row-wrap"><Badge tone="violet">{LEARN_FORMAT_LABEL[i.format]}</Badge>{i.isDemo && <DemoBadge />}{i.progress?.status === 'completed' && <Badge tone="ok">Completed</Badge>}</div>
    <h2 className="h-sm"><Link to={`/learn/${i.slug}`}>{i.title}</Link></h2><p className="muted">{i.summary}</p><p className="faint">{i.category} · {i.level}{i.minutes ? ` · ${i.minutes} min` : ''}</p>
    {i.progress && i.progress.status !== 'completed' && <div className="progress" role="progressbar" aria-label="Progress" aria-valuenow={i.progress.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${i.progress.percent}%` }} /></div>}</Card>;
}

function Blocks({ blocks, slug, quiz, onQuiz }: { blocks: LearnBlock[]; slug: string; quiz: boolean; onQuiz: () => void }) {
  const [ans, setAns] = useState<Record<string, number>>({}); const [result, setResult] = useState<{ score: number; total: number; results: { id: string; correct: boolean; explain: string }[] } | null>(null); const { say } = useToast();
  const submit = async () => { try { const r = await api.put<{ result?: { score: number; total: number; results: { id: string; correct: boolean; explain: string }[] } }>(`/api/learn/${slug}/progress`, { answers: ans }); if (r.result) setResult(r.result); onQuiz(); } catch (e) { say(errMsg(e), 'error'); } };
  const qn = blocks.filter((b) => b.t === 'question').length;
  return (
    <div className="prose stack">
      {blocks.map((b, k) => {
        switch (b.t) {
          case 'h': return <h2 key={k}>{b.text}</h2>;
          case 'p': return <p key={k}>{b.text}</p>;
          case 'list': return <ul key={k}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>;
          case 'step': return <div key={k} className="card"><strong>{b.title}</strong><p>{b.text}</p></div>;
          case 'stat': return <div key={k} className="stat"><strong className="stat-v">{b.value}</strong><span className="muted">{b.label}</span></div>;
          case 'link': return <p key={k}><a href={b.url} target="_blank" rel="noopener noreferrer nofollow">{b.label} <span className="faint">(opens in a new tab)</span></a></p>;
          case 'question': { const r = result?.results.find((x) => x.id === b.id); return (
            <fieldset key={k} className="card fieldset stack-sm"><legend>{b.prompt}</legend>{b.options.map((o, j) => <label key={j} className="radio-row"><input type="radio" name={b.id} disabled={!!result} checked={ans[b.id] === j} onChange={() => setAns({ ...ans, [b.id]: j })} /><span>{o}</span></label>)}
              {r && <p role="status" className={r.correct ? 'ok-text' : 'error-text'}>{r.correct ? 'Correct. ' : 'Not quite. '}{r.explain}</p>}</fieldset>); }
          default: return null;
        }
      })}
      {quiz && qn > 0 && !result && <Button variant="primary" disabled={Object.keys(ans).length < qn} onClick={() => void submit()}>Check answers</Button>}
      {result && <Notice tone="ok" title="Your score">{result.score} of {result.total}. Graded on the server.</Notice>}
    </div>
  );
}

export function LearnItemPage({ params }: P) {
  const { say } = useToast(); const res = useResource(() => api.get<{ item: LearnDetail }>(`/api/learn/${params.slug}`), [params.slug]);
  const mark = async (body: object, ok: string) => { try { await api.put(`/api/learn/${params.slug}/progress`, body); say(ok); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <Async res={res}>{({ item: i }) => (
    <article className="stack-lg"><PageHead title={i.title} back={{ to: '/learn', label: 'Learn' }} actions={<SaveButton kind="learn" refId={i.id} saved={i.saved} />}>{i.summary}</PageHead>
      <div className="row-wrap"><Badge tone="violet">{LEARN_FORMAT_LABEL[i.format]}</Badge><Badge>{i.level}</Badge>{i.minutes && <Badge>{i.minutes} min</Badge>}{i.isDemo && <DemoBadge />}{i.progress && <Badge tone="ok">{i.progress.status === 'completed' ? 'Completed' : `${i.progress.percent}%`}</Badge>}</div>
      {i.demoNotice && <Notice tone="demo">{i.demoNotice}</Notice>}
      {i.format === 'path' && i.pathItems ? <Card><h2 className="h-sm">In this path ({i.pathItems.length})</h2><ol className="stack-sm">{i.pathItems.map((p) => <li key={p.id}><Link to={`/learn/${p.slug}`}>{p.title}</Link> <span className="faint">{LEARN_FORMAT_LABEL[p.format]}{p.progress?.status === 'completed' ? ' · done' : ''}</span></li>)}</ol></Card>
        : <Blocks blocks={i.body} slug={i.slug} quiz={i.format === 'quiz'} onQuiz={res.reload} />}
      {i.format !== 'path' && i.format !== 'quiz' && <div className="row-wrap">{i.progress?.status === 'completed' ? <Button onClick={async () => { await api.del(`/api/learn/${i.slug}/progress`); res.reload(); }}>Reset progress</Button> : <><Button onClick={() => void mark({ percent: 50 }, 'Marked in progress')}>Mark in progress</Button><Button variant="primary" onClick={() => void mark({ completed: true }, 'Marked complete')}>Mark complete</Button></>}</div>}
    </article>)}</Async>;
}

// ───────── Opportunities ─────────
export function OpportunitiesPage({ query }: P) {
  const f = { q: query.get('q') ?? '', type: query.get('type') ?? '', mode: query.get('mode') ?? '', view: query.get('view') ?? '' };
  const res = useResource(() => api.get<{ items: OpportunityCard[]; notice: string | null }>(`/api/opportunities${qs({ q: f.q || undefined, type: f.type || undefined, mode: f.mode || undefined, tracked: f.view === 'tracked' ? '1' : undefined, saved: f.view === 'saved' ? '1' : undefined })}`), [JSON.stringify(f)]);
  return <div className="stack-lg"><PageHead title="Opportunities">Scholarships, internships, grants, jobs, fellowships and more. You track your own progress privately.</PageHead>
    <SearchBar label="Search opportunities" q={f.q} />
    <div className="row-wrap" role="group" aria-label="Filters"><Chip on={!f.type} onClick={() => setQuery({ type: null })}>All types</Chip>{OPP_TYPES.map((t) => <Chip key={t} on={f.type === t} onClick={() => setQuery({ type: f.type === t ? null : t })}>{OPP_TYPE_LABEL[t]}</Chip>)}</div>
    <div className="row-wrap"><Seg label="View" value={(f.view || 'all') as string} onChange={(v) => setQuery({ view: v === 'all' ? null : v })} options={[{ value: 'all', label: 'All' }, { value: 'tracked', label: 'My tracker' }, { value: 'saved', label: 'Saved' }]} />
      <SelectField label="Work mode" value={f.mode} onChange={(e) => setQuery({ mode: e.target.value || null })}><option value="">Any</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on_site">On site</option></SelectField></div>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="briefcase" title="No opportunities here">{f.view ? 'Track or save an opportunity and it will appear here.' : 'Try clearing a filter.'}</EmptyState>)}>{(d) => <>{d.notice && <Notice tone="demo">{d.notice}</Notice>}<div className="grid-cards">{d.items.map((o) => <Card as="article" key={o.id}><div className="row-wrap"><Badge tone="cyan">{OPP_TYPE_LABEL[o.type]}</Badge>{o.isDemo && <DemoBadge />}{o.tracking && <Badge tone="ok">{TRACK_LABEL[o.tracking]}</Badge>}</div><h2 className="h-sm"><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h2><p className="muted">{o.organisation}</p><p className="faint">{o.workMode.replace('_', ' ')}{o.location ? ` · ${o.location}` : ''}{o.deadline ? ` · due ${new Date(o.deadline).toLocaleDateString()}` : ''}</p></Card>)}</div></>}</Async></div>;
}
export function OpportunityPage({ params }: P) {
  const { say } = useToast(); const res = useResource(() => api.get<{ item: OpportunityCard; notice: string | null }>(`/api/opportunities/${params.id}`), [params.id]);
  const track = async (s: string) => { try { if (s) await api.put(`/api/opportunities/${params.id}/tracking`, { status: s }); else await api.del(`/api/opportunities/${params.id}/tracking`); res.reload(); say('Tracker updated'); } catch (e) { say(errMsg(e), 'error'); } };
  return <Async res={res}>{({ item: o, notice }) => <div className="stack-lg"><PageHead title={o.title} back={{ to: '/opportunities', label: 'Opportunities' }} actions={<SaveButton kind="opportunity" refId={o.id} saved={o.saved} />}>{o.organisation}</PageHead>
    <div className="row-wrap"><Badge tone="cyan">{OPP_TYPE_LABEL[o.type]}</Badge><Badge>{o.workMode.replace('_', ' ')}</Badge>{o.location && <Badge>{o.location}</Badge>}{o.deadline && <Badge tone="warn">Due {new Date(o.deadline).toLocaleDateString()}</Badge>}{o.isDemo && <DemoBadge />}</div>
    {notice && <Notice tone="demo">{notice}</Notice>}<p className="prose">{o.description}</p>
    <Card><h2 className="h-sm">Your tracker</h2><p className="muted">Only you see this.</p><SelectField label="Status" value={o.tracking ?? ''} onChange={(e) => void track(e.target.value)}><option value="">Not tracking</option>{TRACK_STATUSES.map((s) => <option key={s} value={s}>{TRACK_LABEL[s]}</option>)}</SelectField></Card>
    {o.applyUrl ? <a className="btn btn-primary" href={o.applyUrl} target="_blank" rel="noopener noreferrer nofollow">Go to the official page <span className="sr-only">(opens in a new tab)</span></a> : <p className="muted">No application link for this listing.</p>}</div>}</Async>;
}

// ───────── Mentors ─────────
export function MentorsPage({ query }: P) {
  const q = query.get('q') ?? ''; const res = useResource(() => api.get<{ items: MentorCard[]; notice: string }>(`/api/mentors${qs({ q: q || undefined })}`), [q]); const { say } = useToast(); const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const send = async (id: string) => { try { await api.post(`/api/mentors/${id}/requests`, { message: msg || undefined }); say('Request recorded'); setOpen(null); setMsg(''); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <div className="stack-lg"><PageHead title="Mentors">People who offer guidance. Always check a mentor’s credentials yourself.</PageHead><SearchBar label="Search mentors" q={q} />
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="compass2" title="No mentors match" />)}>{(d) => <><Notice tone="demo">{d.notice}</Notice><div className="grid-cards">{d.items.map((m) => <Card as="article" key={m.id}><div className="row-wrap"><h2 className="h-sm">{m.name}</h2>{m.isDemo && <DemoBadge />}</div><p className="muted">{m.headline}</p><p>{m.bio}</p><div className="row-wrap">{m.expertise.map((x) => <Badge key={x}>{x}</Badge>)}</div>{m.availabilityNote && <p className="faint">{m.availabilityNote}</p>}
      <div className="row-wrap"><SaveButton kind="mentor" refId={m.id} saved={m.saved} />{m.requested ? <Button onClick={async () => { await api.del(`/api/mentors/${m.id}/requests`); res.reload(); }}>Withdraw request</Button> : <Button variant="primary" onClick={() => setOpen(m.id)}>Request mentoring</Button>}</div>
      {open === m.id && <div className="stack-sm"><TextArea label="A short note" optional maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} /><div className="row-wrap"><Button variant="primary" size="sm" onClick={() => void send(m.id)}>Send request</Button><Button variant="ghost" size="sm" onClick={() => setOpen(null)}>Cancel</Button></div></div>}</Card>)}</div></>}</Async></div>;
}

// ───────── Events ─────────
export function EventsPage({ query }: P) {
  const f = { q: query.get('q') ?? '', when: query.get('when') ?? 'upcoming', format: query.get('format') ?? '' };
  const res = useResource(() => api.get<{ items: EventCard[]; notice: string | null }>(`/api/events${qs({ q: f.q || undefined, when: f.when, format: f.format || undefined })}`), [JSON.stringify(f)]);
  return <div className="stack-lg"><PageHead title="Events">Workshops, meetups and sessions. RSVPs are private to you unless an event says otherwise.</PageHead><SearchBar label="Search events" q={f.q} />
    <div className="row-wrap"><Seg label="When" value={f.when} onChange={(v) => setQuery({ when: v === 'upcoming' ? null : v })} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'mine', label: 'My RSVPs' }, { value: 'past', label: 'Past' }]} />
      <SelectField label="Format" value={f.format} onChange={(e) => setQuery({ format: e.target.value || null })}><option value="">Any</option><option value="virtual">Virtual</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></SelectField></div>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="calendar" title="No events here" />)}>{(d) => <>{d.notice && <Notice tone="demo">{d.notice}</Notice>}<div className="grid-cards">{d.items.map((e) => <Card as="article" key={e.id}><div className="row-wrap"><Badge>{e.format.replace('_', ' ')}</Badge>{e.isDemo && <DemoBadge />}{e.myResponse === 'yes' && <Badge tone="ok">Going</Badge>}</div><h2 className="h-sm"><Link to={`/events/${e.id}`}>{e.title}</Link></h2><p className="muted">{new Date(e.startsAt).toLocaleString()}</p>{e.location && <p className="faint">{e.location}</p>}</Card>)}</div></>}</Async></div>;
}
export function EventPage({ params }: P) {
  const { say } = useToast(); const res = useResource(() => api.get<{ item: EventCard; notice: string | null }>(`/api/events/${params.id}`), [params.id]);
  const rsvp = async (r: string) => { try { if (r) await api.put(`/api/events/${params.id}/rsvp`, { response: r }); else await api.del(`/api/events/${params.id}/rsvp`); res.reload(); say('RSVP updated'); } catch (e) { say(errMsg(e), 'error'); } };
  return <Async res={res}>{({ item: e, notice }) => <div className="stack-lg"><PageHead title={e.title} back={{ to: '/events', label: 'Events' }} actions={<SaveButton kind="event" refId={e.id} saved={e.saved} />}>{new Date(e.startsAt).toLocaleString()}{e.endsAt ? ` – ${new Date(e.endsAt).toLocaleTimeString()}` : ''}</PageHead>
    <div className="row-wrap"><Badge>{e.format.replace('_', ' ')}</Badge>{e.location && <Badge>{e.location}</Badge>}{e.isDemo && <DemoBadge />}</div>{notice && <Notice tone="demo">{notice}</Notice>}<p className="prose">{e.description}</p>
    <Card><h2 className="h-sm">Will you go?</h2><div className="row-wrap" role="group" aria-label="RSVP">{(['yes', 'maybe', 'no'] as const).map((r) => <Chip key={r} on={e.myResponse === r} onClick={() => void rsvp(e.myResponse === r ? '' : r)}>{r === 'yes' ? 'Going' : r === 'maybe' ? 'Maybe' : 'Can’t go'}</Chip>)}</div><p className="faint">{e.counts.yes} going · {e.counts.maybe} maybe{e.capacity ? ` · capacity ${e.capacity}` : ''}</p></Card></div>}</Async>;
}
