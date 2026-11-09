import { useState } from 'react';
import { api } from '../api/client';
import { Link } from '../lib/router';
import { Async, Badge, Button, Card, Confirm, EmptyState, Notice, SelectField, TextArea, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { timeAgo } from '../lib/time';
import { POLL_ELIGIBILITY, POLL_LIMITS as L, POLL_STATE_LABEL, type PollView } from '../../shared/polls';

const need = (s: string) => s.trim().length >= 10;

// ───────── appointments: position vs access ─────────
export function AppointmentsAdmin() {
  const { say } = useToast(); const res = useResource(() => api.get<any>('/api/founder/appointments'), []); const [act, setAct] = useState<{ g: any; kind: 'restrict' | 'restore' } | null>(null); const [why, setWhy] = useState('');
  const run = async () => { await api.post(`/api/founder/appointments/${act!.g.id}/${act!.kind}`, { reason: why }); say(act!.kind === 'restrict' ? 'Access restricted' : 'Access restored'); setWhy(''); res.reload(); };
  return <Async res={res}>{(d) => <div className="stack-lg">
    <Notice>{d.note}</Notice>
    <Card className="stack-sm"><h2 className="h-sm">Appointments and access</h2>
      {d.items.length === 0 ? <p className="muted">Nobody holds a role yet.</p> : <ul className="plain stack-sm">{d.items.map((g: any) => <li key={g.id} className="card stack-sm"><div className="spread"><div><strong>@{g.holder.handle}</strong> <span className="muted">· {g.seatTitle ?? g.role.replace('_', ' ')}</span></div>
        <Badge tone={g.state === 'active' ? 'ok' : g.state === 'restricted' ? 'warn' : undefined}>{g.state === 'active' ? 'Access active' : g.state === 'restricted' ? 'Access paused' : 'Removed'}</Badge></div>
        <p className="faint">Appointed {timeAgo(g.grantedAt, Date.now())}{g.grantedBy ? ` by @${g.grantedBy}` : ''}{g.reason ? ` · ${g.reason}` : ''}</p>
        {g.restrictedReason && <p className="muted">Paused because: {g.restrictedReason}</p>}{g.removedReason && <p className="muted">Removed because: {g.removedReason}</p>}
        {g.state === 'active' && g.role !== 'founder' && <div><Button size="sm" variant="secondary" onClick={() => setAct({ g, kind: 'restrict' })}>Pause access (keep the appointment)</Button></div>}
        {g.state === 'restricted' && <div><Button size="sm" variant="primary" onClick={() => setAct({ g, kind: 'restore' })}>Restore access</Button></div>}</li>)}</ul>}
      <p className="faint">To appoint or remove someone from a seat, use the Governance workspace (these go through the approval workflow).</p></Card>
    <Card className="stack-sm"><h2 className="h-sm">History of pauses and restores</h2>{d.history.length === 0 ? <p className="muted">None yet.</p> : <ol className="timeline">{d.history.map((h: any, i: number) => <li key={i}><span className="faint">{timeAgo(h.at, Date.now())}</span> {h.action}{h.by ? ` by @${h.by}` : ''}{h.reason ? ` — ${h.reason}` : ''}</li>)}</ol>}<Link to="/founder/audit">Full audit log</Link></Card>
    <Confirm open={!!act} title={act?.kind === 'restrict' ? `Pause @${act?.g.holder.handle}’s access?` : `Restore @${act?.g.holder.handle}’s access?`} confirmLabel={act?.kind === 'restrict' ? 'Pause access' : 'Restore access'} danger={act?.kind === 'restrict'} onConfirm={async () => { if (!need(why)) throw new Error('Write a reason of at least 10 characters.'); await run(); }} onClose={() => { setAct(null); setWhy(''); }}>
      <p>{act?.kind === 'restrict' ? 'They keep the appointment but can’t use its permissions until you restore them. They’re told. It is recorded and can be undone.' : 'They get their role’s permissions back immediately. It is recorded.'}</p>
      <TextArea label="Reason (recorded)" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} maxLength={400} /></Confirm></div>}</Async>;
}

// ───────── polls (Founder) ─────────
export function PollsAdmin() {
  const { say } = useToast(); const res = useResource(() => api.get<{ items: PollView[] }>('/api/founder/polls'), []);
  const [f, setF] = useState({ title: '', description: '', eligibility: 'citizens', community: '', options: ['', ''] }); const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); try { await api.post('/api/founder/polls', { title: f.title, description: f.description, eligibility: f.eligibility, ...(f.eligibility === 'community' ? { communitySlug: f.community.trim() } : {}), options: f.options.map((o) => o.trim()).filter(Boolean) }); say('Draft saved. Nothing is visible to members until you publish it.'); setF({ title: '', description: '', eligibility: 'citizens', community: '', options: ['', ''] }); res.reload(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <div className="stack-lg"><div><h2 className="h-md">Polls</h2><p className="muted">Advisory polls to inform a decision. You choose who may vote and when voting closes; each person gets one final vote; totals appear only when voting closes; nobody can see how an individual voted. Not every decision needs a vote.</p></div>
    <Card className="stack" as="section" aria-label="New poll"><h3 className="h-sm">Draft a poll</h3>
      <PollAiAssist onDraft={(d) => setF({ ...f, title: d.title, description: d.description, options: d.options })} />
      <TextField label="Question" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={L.titleMax} />
      <TextArea label="Background for voters" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} maxLength={L.descMax} />
      <SelectField label="Who may vote" value={f.eligibility} onChange={(e) => setF({ ...f, eligibility: e.target.value })} hint={POLL_ELIGIBILITY.find((x) => x[0] === f.eligibility)![2]}>{POLL_ELIGIBILITY.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</SelectField>
      {f.eligibility === 'community' && <TextField label="Community address (the part after /communities/)" value={f.community} onChange={(e) => setF({ ...f, community: e.target.value })} />}
      <fieldset className="stack-sm fieldset"><legend>Options (2 to {L.optionsMax})</legend>{f.options.map((o, i) => <TextField key={i} label={`Option ${i + 1}`} value={o} maxLength={L.optionMax} onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })} />)}
        {f.options.length < L.optionsMax && <div><Button size="sm" variant="ghost" onClick={() => setF({ ...f, options: [...f.options, ''] })}>Add an option</Button></div>}</fieldset>
      <div><Button variant="primary" busy={busy} onClick={() => void create()}>Save draft</Button></div></Card>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="inbox" title="No polls yet" />)}>{(d) => <ul className="plain stack-sm">{d.items.map((p) => <li key={p.id}><PollCard p={p} onChanged={res.reload} /></li>)}</ul>}</Async></div>;
}

function PollCard({ p, onChanged }: { p: PollView; onChanged: () => void }) {
  const { say } = useToast(); const [closes, setClose] = useState(''); const [opens, setOpens] = useState(''); const [text, setText] = useState(''); const [cancel, setCancel] = useState(false); const [busy, setBusy] = useState(false);
  const go = async (path: string, body: unknown, msg: string) => { setBusy(true); try { await api.post(`/api/founder/polls/${p.id}/${path}`, body); say(msg); setText(''); onChanged(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <Card as="article" className="stack-sm"><div className="spread"><h3 className="h-sm">{p.title}</h3><Badge tone={p.state === 'open' ? 'ok' : p.state === 'scheduled' ? 'violet' : p.state === 'cancelled' ? 'warn' : undefined}>{POLL_STATE_LABEL[p.state]}</Badge></div>
    <p className="muted">{p.description}</p><p className="faint">Who may vote: {p.eligibilityText}{p.state === 'scheduled' && p.opensAt ? ` · opens ${new Date(p.opensAt).toLocaleString()}` : ''}{p.closesAt ? ` · closes ${new Date(p.closesAt).toLocaleString()}` : ''} · {p.turnout.votes} of {p.turnout.eligible} have voted</p>
    <ul className="plain">{p.options.map((o) => <li key={o.id}>{o.label}{o.votes !== null && <strong> — {o.votes}</strong>}</li>)}</ul>
    {p.state === 'open' && <p className="faint">Totals stay hidden until voting closes.</p>}
    {p.decision && <Notice tone="ok" title="Decision recorded">{p.decision}</Notice>}{p.cancelReason && <p className="muted">Cancelled: {p.cancelReason}</p>}
    {p.state === 'draft' && <div className="row-wrap"><TextField label="Opens (optional)" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} hint={`Leave empty to open now. Or choose a time up to ${L.maxScheduleDays} days ahead; people are told when it opens.`} /><TextField label="Voting closes" type="datetime-local" value={closes} onChange={(e) => setClose(e.target.value)} hint={`Between ${L.minHours} hour and ${L.maxDays} days from now. Publishing makes it visible to everyone eligible, and the rules can’t be edited afterwards.`} />
      <Button variant="primary" busy={busy} disabled={!closes} onClick={() => void go('publish', { closesAt: new Date(closes).toISOString(), ...(opens ? { opensAt: new Date(opens).toISOString() } : {}) }, opens ? 'Scheduled' : 'Published')}>Publish poll</Button><Button variant="ghost" onClick={() => setCancel(true)}>Discard</Button></div>}
    {(p.state === 'open' || p.state === 'scheduled') && <Button size="sm" variant="ghost" onClick={() => setCancel(true)}>Cancel this poll…</Button>}
    {p.state === 'closed' && !p.decision && <div className="stack-sm"><TextArea label="Record your decision and why (visible to eligible voters)" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={L.decisionMax} /><div><Button variant="primary" busy={busy} disabled={!need(text)} onClick={() => void go('decision', { decision: text }, 'Decision recorded')}>Record decision</Button></div></div>}
    <Confirm open={cancel} danger title={p.state === 'draft' ? 'Discard this draft?' : 'Cancel this poll?'} confirmLabel={p.state === 'draft' ? 'Discard' : 'Cancel poll'} onConfirm={async () => { if (!need(text)) throw new Error('Write a reason of at least 10 characters.'); await api.post(`/api/founder/polls/${p.id}/cancel`, { reason: text }); say('Cancelled'); setText(''); onChanged(); }} onClose={() => setCancel(false)}>
      <p>{p.state === 'open' ? 'Votes already cast are kept but the poll ends and no results are shown. Voters will see that it was cancelled.' : 'It will not be published.'}</p><TextArea label="Reason (recorded)" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={400} /></Confirm></Card>;
}

// ───────── community oversight ─────────
export function CommunityOversight({ c, onDone }: { c: { slug: string; name: string; closed: boolean; restricted: boolean; restrictedReason: string | null }; onDone: () => void }) {
  const { say } = useToast(); const [action, setAction] = useState<null | 'restrict' | 'unrestrict' | 'close' | 'reopen'>(null); const [why, setWhy] = useState('');
  const TEXT = { restrict: ['Restrict this community?', 'Only its moderators can post or comment, and it is hidden from discovery. Members can still read it. Reversible.'], unrestrict: ['Lift the restriction?', 'Its previous posting, commenting and discovery settings are restored.'],
    close: ['Close this community?', 'It becomes unreachable for everyone and its content is kept, not deleted. You can reopen it.'], reopen: ['Reopen this community?', 'It becomes reachable again.'] } as const;
  return <><div className="row-wrap">{c.closed ? <Button size="sm" onClick={() => setAction('reopen')}>Reopen</Button> : <>
    {c.restricted ? <Button size="sm" onClick={() => setAction('unrestrict')}>Lift restriction</Button> : <Button size="sm" variant="secondary" onClick={() => setAction('restrict')}>Restrict</Button>}<Button size="sm" variant="ghost" onClick={() => setAction('close')}>Close…</Button></>}</div>
    <Confirm open={!!action} danger={action === 'close' || action === 'restrict'} title={action ? `${TEXT[action][0]} (${c.name})` : ''} confirmLabel="Confirm" onConfirm={async () => { if (!need(why)) throw new Error('Write a reason of at least 10 characters.'); await api.post(`/api/founder/communities/${c.slug}/oversight`, { action, reason: why }); say('Done and recorded'); setWhy(''); onDone(); }} onClose={() => { setAction(null); setWhy(''); }}>
      <p>{action ? TEXT[action][1] : ''}</p><TextArea label="Reason (recorded in the audit log)" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} maxLength={400} /></Confirm></>;
}

// ───────── findings: what it means and what to do ─────────
export const NEXT: Record<string, { matters: string; limits: string; next: { label: string; to: string }[] }> = {
  'mod.overdue': { matters: 'People who reported something are waiting longer than the target time.', limits: 'Counts open cases against their target times. It doesn’t judge how serious each one is.', next: [{ label: 'Open the moderation queue', to: '/moderation' }, { label: 'Review who can moderate', to: '/founder/appointments' }] },
  'mod.none': { matters: 'Without moderators, reports have nobody to review them.', limits: 'Counts current moderator appointments only.', next: [{ label: 'Appoint a moderator', to: '/founder/governance' }] },
  'ai.demo': { matters: 'Members see scripted replies, not real AI.', limits: 'This only reports configuration. Connecting a provider costs money and has not been tested live here.', next: [{ label: 'Review the AI Council', to: '/founder/council' }] },
  'ai.unverified': { matters: 'A provider is set but nobody has confirmed it works.', limits: 'Only a live round-trip check can confirm it.', next: [{ label: 'Open Founder AI', to: '/founder/ai' }] },
  'sec.review': { matters: 'Roles should be reviewed regularly so access matches need.', limits: 'Based on the date of the last completed review.', next: [{ label: 'Start or continue an access review', to: '/founder/access' }, { label: 'Pause or restore access', to: '/founder/appointments' }] },
  'prop.stale': { matters: 'Proposals that wait too long leave work blocked.', limits: 'Counts proposals older than a week still awaiting a decision.', next: [{ label: 'Open Decisions', to: '/founder/decisions' }] },
  'data.demo_prod': { matters: 'Fictional demo people and content should not appear in a live environment.', limits: 'Detects demo-flagged records only.', next: [{ label: 'See what demo data exists (Overview)', to: '/founder' }] },
  'growth.obs': { matters: 'A change in sign-ups can signal something worth understanding.', limits: 'Two weeks of counts show a change, not a cause. Don’t assume why it moved.', next: [{ label: 'Look at communities', to: '/founder/communities' }, { label: 'Read citizens’ suggestions', to: '/founder/suggestions' }] },
  'growth.forecast': { matters: 'A rough expectation of next week’s sign-ups.', limits: 'A simple projection from last week. It can easily be wrong.', next: [] },
};
export function FindingNext({ f }: { f: { dedupeKey: string | null } }) {
  const n = f.dedupeKey ? NEXT[f.dedupeKey] : undefined; if (!n) return null;
  return <div className="stack-sm"><p><strong>Why it matters:</strong> {n.matters}</p><p className="faint"><strong>Limits:</strong> {n.limits}</p>{n.next.length > 0 && <div className="row-wrap"><strong>What you can do next:</strong>{n.next.map((x) => <Link key={x.to} to={x.to} className="btn btn-secondary btn-sm">{x.label}</Link>)}</div>}</div>;
}

function PollAiAssist({ onDraft }: { onDraft: (d: { title: string; description: string; options: string[] }) => void }) {
  const { say } = useToast(); const st = useResource(() => api.get<{ provider: string }>('/api/founder-ai/state'), []); const [topic, setTopic] = useState(''); const [busy, setBusy] = useState(false); const [label, setLabel] = useState('');
  const demo = st.data?.provider === 'demo';
  const go = async () => { setBusy(true); try { const r = await api.post<{ draft: any; label: string }>('/api/founder/polls/draft-assist', { topic }); onDraft(r.draft); setLabel(r.label); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <details className="stack-sm"><summary>Draft the wording with Founder AI (optional)</summary>
    {demo ? <Notice tone="demo" title="Not available in demo mode">No AI model is connected, so Founder AI can’t draft anything. Write the poll yourself below.</Notice> : <>
      <TextField label="What do you want to ask about?" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={400} hint="It fills the form below with a draft. Nothing is saved until you press Save draft." />
      <div><Button size="sm" busy={busy} disabled={topic.trim().length < 10} onClick={() => void go()}>Draft with Founder AI</Button></div>{label && <Notice tone="info">{label}</Notice>}</>}</details>;
}
