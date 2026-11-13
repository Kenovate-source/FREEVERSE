import { useState } from 'react';
import { api } from '../api/client';
import { Link, navigate } from '../lib/router';
import { Async, Badge, Button, Card, Chip, EmptyState, Notice, PageHead, SelectField, TextArea, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { useSession } from '../state/session';
import { timeAgo } from '../lib/time';
import { ReportDialog } from '../features/posts';
import { PROJECT_STATUS_LABEL, type ProjectCard, type ProjectDetail, type ProjectStatus } from '../../shared/api/projects';
import { UNIVERSES } from '../../shared/universes';

type P = { params: Record<string, string>; query: URLSearchParams };
const MINE_LABEL = { owner: 'You own this', member: 'You’re on the team', pending: 'Request sent' } as const;

/** The Projects space inside one Universe: browse, search, start one. */
export function ProjectsSpace({ universe }: { universe: string }) {
  const { say } = useToast(); const name = UNIVERSES.find((u) => u.id === universe)?.name ?? 'this Universe';
  const [q, setQ] = useState(''); const [mine, setMine] = useState(false); const [status, setStatus] = useState<'' | ProjectStatus>(''); const [make, setMake] = useState(false);
  const res = useResource(() => api.get<{ items: ProjectCard[] }>(`/api/universes/${universe}/projects?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(mine ? { mine: '1' } : {}) })}`), [universe, q, status, mine]);
  const [f, setF] = useState({ title: '', summary: '', lookingFor: '', details: '', maxMembers: '8' }); const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); try { const r = await api.post<{ id: string }>(`/api/universes/${universe}/projects`, { title: f.title, summary: f.summary, lookingFor: f.lookingFor || undefined, details: f.details || undefined, maxMembers: Number(f.maxMembers) || 8 }); say('Project started'); navigate(`/projects/${r.id}`); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <div className="stack-lg">
    <Card className="stack-sm"><h2 className="h-sm">Projects in {name}</h2><p className="muted">Start something and invite people, or ask to join one. Owners decide who joins. Everyone here is an adult member; keep it kind and don’t share private contact details until you trust someone.</p>
      <div className="row-wrap"><Button variant="primary" onClick={() => setMake(!make)} aria-expanded={make}>{make ? 'Close' : 'Start a project'}</Button><Chip on={mine} onClick={() => setMine(!mine)}>My projects</Chip></div></Card>
    {make && <Card className="stack-sm"><TextField label="Project name" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <TextArea label="What is it?" hint="One or two sentences. At least 10 characters." maxLength={280} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      <TextField label="Who are you looking for?" optional maxLength={120} hint="Example: a designer and a writer" value={f.lookingFor} onChange={(e) => setF({ ...f, lookingFor: e.target.value })} />
      <TextArea label="More detail" optional maxLength={2000} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
      <TextField label="Team size limit" type="number" value={f.maxMembers} onChange={(e) => setF({ ...f, maxMembers: e.target.value })} hint="2 to 12, including you" />
      <div className="row-wrap"><Button variant="primary" busy={busy} disabled={f.title.trim().length < 3 || f.summary.trim().length < 10} onClick={() => void create()}>Start project</Button></div></Card>}
    <div className="row-wrap"><TextField label="Search projects" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" />
      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')}><option value="">Any status</option>{(['open', 'in_progress', 'completed'] as const).map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}</SelectField></div>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="compass2" title="No projects yet">{mine ? 'You’re not part of a project here yet.' : `Nothing here yet. Be the first to start one in ${name}.`}</EmptyState>)}>{(d) => <div className="stack-sm">{d.items.map((p) => <ProjectRow key={p.id} p={p} />)}</div>}</Async></div>;
}

function ProjectRow({ p }: { p: ProjectCard }) {
  return <Card as="article" className="stack-sm"><div className="row-wrap"><h3 className="h-sm"><Link to={`/projects/${p.id}`}>{p.title}</Link></h3><Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>{p.mine && <Badge>{MINE_LABEL[p.mine]}</Badge>}</div>
    <p>{p.summary}</p>{p.lookingFor && <p className="muted">Looking for: {p.lookingFor}</p>}<p className="faint">By {p.owner.handle ? <Link to={`/u/${p.owner.handle}`}>{p.owner.displayName}</Link> : p.owner.displayName} · {p.members} of {p.maxMembers} on the team · {timeAgo(p.createdAt, Date.now())}</p></Card>;
}

export function ProjectPage({ params }: P) {
  const res = useResource(() => api.get<{ project: ProjectDetail; hidden: string | null }>(`/api/projects/${params.id}`), [params.id]); const { say } = useToast(); const { me } = useSession();
  const [hideNote, setHideNote] = useState<string | null>(null);
  const [msg, setMsg] = useState(''); const [upd, setUpd] = useState(''); const [rep, setRep] = useState(false); const [ask, setAsk] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); say(ok); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <Async res={res}>{({ project: p, hidden }) => {
    const owner = p.mine === 'owner'; const team = p.mine === 'owner' || p.mine === 'member'; const uni = UNIVERSES.find((u) => u.id === p.universeId); const ownerHandle = p.team.find((m) => m.role === 'owner')?.handle;
    return <div className="stack-lg"><PageHead title={p.title}><Link to={`/universes/${p.universeId}/projects`}>← Projects in {uni?.name}</Link></PageHead>
      {hidden && <Notice tone="warn">Hidden by moderators: {hidden}. Only you and moderators can see it.</Notice>}
      <Card className="stack-sm"><div className="row-wrap"><Badge>{PROJECT_STATUS_LABEL[p.status]}</Badge>{p.mine && <Badge>{MINE_LABEL[p.mine]}</Badge>}<span className="faint">{p.members} of {p.maxMembers} on the team</span></div>
        <p>{p.summary}</p>{p.details && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{p.details}</p>}{p.lookingFor && <p><strong>Looking for:</strong> {p.lookingFor}</p>}
        {!p.mine && (p.status === 'open' || p.status === 'in_progress') && (!ask ? <Button variant="primary" onClick={() => setAsk(true)} style={{ justifySelf: 'start' }}>Ask to join</Button> : <div className="stack-sm"><TextArea label="A short note to the owner" optional maxLength={300} value={msg} onChange={(e) => setMsg(e.target.value)} hint="What you can bring. Don’t include private contact details." /><div className="row-wrap"><Button variant="primary" onClick={() => void run(() => api.post(`/api/projects/${p.id}/join`, { message: msg || undefined }), 'Request sent')}>Send request</Button><Button variant="ghost" onClick={() => setAsk(false)}>Cancel</Button></div></div>)}
        {p.mine === 'pending' && <p className="muted">Your request is waiting for the owner.</p>}</Card>
      <Card className="stack-sm"><h2 className="h-sm">Team</h2><ul className="plain stack-sm">{p.team.map((m) => <li key={m.userId}>{m.handle ? <Link to={`/u/${m.handle}`}>{m.displayName}</Link> : m.displayName} <span className="faint">{m.role === 'owner' ? 'Owner' : 'Member'}</span>{owner && m.role === 'member' && <> <Button size="sm" variant="ghost" onClick={() => void run(() => api.del(`/api/projects/${p.id}/members/${m.userId}`), 'Removed')}>Remove</Button></>}</li>)}</ul></Card>
      {owner && p.requests.length > 0 && <Card className="stack-sm"><h2 className="h-sm">Requests to join</h2><ul className="plain stack-sm">{p.requests.map((r) => <li key={r.userId} className="stack-sm"><span>{r.handle ? <Link to={`/u/${r.handle}`}>{r.displayName}</Link> : r.displayName} <span className="faint">{timeAgo(r.at, Date.now())}</span></span>{r.message && <span className="muted">{r.message}</span>}<span className="row-wrap"><Button size="sm" variant="primary" onClick={() => void run(() => api.post(`/api/projects/${p.id}/requests/${r.userId}`, { decision: 'accept' }), 'Added to the team')}>Accept</Button><Button size="sm" onClick={() => void run(() => api.post(`/api/projects/${p.id}/requests/${r.userId}`, { decision: 'decline' }), 'Declined')}>Decline</Button></span></li>)}</ul></Card>}
      <Card className="stack-sm"><h2 className="h-sm">Updates</h2>
        {team && p.status !== 'archived' && <div className="stack-sm"><TextArea label="Post an update" maxLength={1000} value={upd} onChange={(e) => setUpd(e.target.value)} hint="The rest of the team is notified." /><Button variant="primary" size="sm" disabled={upd.trim().length < 2} onClick={() => void run(async () => { await api.post(`/api/projects/${p.id}/updates`, { body: upd }); setUpd(''); }, 'Posted')} style={{ justifySelf: 'start' }}>Post update</Button></div>}
        {p.updates.length === 0 ? <p className="muted">No updates yet.</p> : <ul className="plain stack-sm" aria-label="Project updates">{p.updates.map((u) => <li key={u.id}><span style={{ whiteSpace: 'pre-wrap' }}>{u.body}</span> <span className="faint">{u.author.displayName} · {timeAgo(u.at, Date.now())}</span></li>)}</ul>}</Card>
      <div className="row-wrap">
        {p.mine === 'member' && <Button onClick={() => void run(() => api.del(`/api/projects/${p.id}/members/${me?.id}`), 'You left')}>Leave project</Button>}
        {owner && <><SelectField label="Status" value={p.status} onChange={(e) => void run(() => api.patch(`/api/projects/${p.id}`, { status: e.target.value }), 'Status updated')}>{(['open', 'in_progress', 'completed', 'archived'] as const).map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}</SelectField>
          {!confirmDel ? <Button variant="ghost" onClick={() => setConfirmDel(true)}>Delete project</Button> : <><Button variant="danger" onClick={() => void run(async () => { await api.del(`/api/projects/${p.id}`); navigate(`/universes/${p.universeId}/projects`); }, 'Deleted')}>Confirm delete</Button><Button variant="ghost" onClick={() => setConfirmDel(false)}>Keep it</Button></>}</>}
        {!owner && <Button variant="ghost" onClick={() => setRep(true)}>Report</Button>}
        {p.canModerate && !hidden && (hideNote === null ? <Button variant="ghost" onClick={() => setHideNote('')}>Hide (moderator)</Button> : <div className="stack-sm"><TextField label="Reason for hiding" hint="The owner is told a moderator acted. Recorded in the audit log." value={hideNote} onChange={(e) => setHideNote(e.target.value)} /><div className="row-wrap"><Button variant="danger" disabled={hideNote.trim().length < 5} onClick={() => void run(async () => { await api.post(`/api/projects/${p.id}/hide`, { hide: true, note: hideNote }); setHideNote(null); }, 'Hidden')}>Hide project</Button><Button variant="ghost" onClick={() => setHideNote(null)}>Cancel</Button></div></div>)}</div>
      <ReportDialog target={rep ? { type: 'project', id: p.id } : null} onClose={() => setRep(false)} />
      <p className="faint">Projects are run by members. FREEVERSE doesn’t vouch for any project or its people. Use Report or Block if something feels wrong.</p></div>; }}</Async>;
}
