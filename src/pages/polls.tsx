import { useState } from 'react';
import { api } from '../api/client';
import { Async, Badge, Button, Card, EmptyState, Notice, PageHead, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { POLL_STATE_LABEL, type PollView } from '../../shared/polls';

export function PollsPage(_: { params: Record<string, string>; query: URLSearchParams }) {
  const res = useResource(() => api.get<{ items: PollView[] }>('/api/polls'), []);
  return <div className="stack-lg"><PageHead title="Polls">Questions put to the people they affect. Polls are advisory: they inform a decision, and the decision and its reasons are published afterwards.</PageHead>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="inbox" title="No polls for you right now">When you’re invited to vote on something, it will appear here.</EmptyState>)}>{(d) => <ul className="plain stack-sm">{d.items.map((p) => <li key={p.id}><PollItem p={p} onChanged={res.reload} /></li>)}</ul>}</Async></div>;
}

function PollItem({ p, onChanged }: { p: PollView; onChanged: () => void }) {
  const { say } = useToast(); const [pick, setPick] = useState(''); const [busy, setBusy] = useState(false); const open = p.state === 'open'; const voted = p.viewer.votedOptionId;
  const vote = async () => { setBusy(true); try { await api.post(`/api/polls/${p.id}/vote`, { optionId: pick }); say('Your vote was recorded.'); onChanged(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  const total = p.options.reduce((n, o) => n + (o.votes ?? 0), 0);
  return <Card as="article" className="stack-sm"><div className="spread"><h2 className="h-sm">{p.title}</h2><Badge tone={open ? 'ok' : undefined}>{POLL_STATE_LABEL[p.state]}</Badge></div>
    <p>{p.description}</p><p className="faint">Who may vote: {p.eligibilityText}{p.closesAt ? ` · ${open ? 'closes' : 'closed'} ${new Date(p.closesAt).toLocaleString()}` : ''} · {p.turnout.votes} of {p.turnout.eligible} have voted</p>
    {open && !voted && p.viewer.eligible && <fieldset className="stack-sm fieldset"><legend>Your vote (final once sent)</legend>{p.options.map((o) => <label key={o.id} className="radio-row"><input type="radio" name={`p-${p.id}`} value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} /> {o.label}</label>)}
      <div><Button variant="primary" busy={busy} disabled={!pick} onClick={() => void vote()}>Send my vote</Button></div></fieldset>}
    {open && voted && <Notice tone="ok">You voted. Totals appear when voting closes.</Notice>}
    {p.state === 'closed' && <ul className="plain stack-sm" aria-label="Results">{p.options.map((o) => <li key={o.id}><div className="spread"><span>{o.label}{voted === o.id ? ' (your vote)' : ''}</span><strong>{o.votes} {total ? `· ${Math.round(((o.votes ?? 0) / total) * 100)}%` : ''}</strong></div></li>)}</ul>}
    {p.state === 'closed' && (p.decision ? <Notice title="Decision">{p.decision}</Notice> : <p className="muted">Voting has closed. A decision hasn’t been recorded yet.</p>)}
    <p className="faint">{p.advisory} {p.resultsNote}</p></Card>;
}
