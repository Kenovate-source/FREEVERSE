import { useState } from 'react';
import { api, qs } from '../api/client';
import { Async, Badge, Button, Card, Chip, EmptyState, Notice, SelectField, TextArea, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { timeAgo } from '../lib/time';
import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES, categoryLabel, statusLabel, type StaffSuggestionView } from '../../shared/suggestions';
import { StatusBadge } from './suggestions';

interface Row { id: string; title: string; body: string; category: string; area: string | null; status: string; createdAt: string; author: { handle: string } | null }
interface Q { items: Row[]; counts: Record<string, number>; canReview: boolean; possibleDuplicates: { id: string; title: string }[][]; duplicatesNote: string }

export function SuggestionsAdmin() {
  const [status, setStatus] = useState(''); const [category, setCategory] = useState(''); const [q, setQ] = useState(''); const [applied, setApplied] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const res = useResource(() => api.get<Q>(`/api/founder/suggestions${qs({ status: status || undefined, category: category || undefined, q: applied || undefined })}`), [status, category, applied]);
  return <div className="stack-lg"><div><h2 className="h-md">Suggestions from citizens</h2><p className="muted">Private to the author and the people allowed to review. Nothing is discarded silently: every change is recorded, and the author sees any public note you add.</p></div>
    <Async res={res}>{(d) => <>
      <div className="row-wrap" role="group" aria-label="Status">{[['', 'All'], ...SUGGESTION_STATUSES.map((s) => [s[0], s[1]])].map(([id, label]) => <Chip key={id} on={status === id} onClick={() => setStatus(id!)}>{label}{id && d.counts[id] ? ` (${d.counts[id]})` : ''}</Chip>)}</div>
      <form className="row-wrap" role="search" onSubmit={(e) => { e.preventDefault(); setApplied(q); }}><TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} /><SelectField label="Topic" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All topics</option>{SUGGESTION_CATEGORIES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</SelectField><Button type="submit">Search</Button></form>
      {d.possibleDuplicates.length > 0 && <Card className="stack-sm"><h3 className="h-sm">Possible duplicates</h3><p className="faint">{d.duplicatesNote}</p><ul className="plain stack-sm">{d.possibleDuplicates.map((g, i) => <li key={i}><ul>{g.map((x) => <li key={x.id}><button type="button" className="linklike" onClick={() => setOpen(x.id)}>{x.title}</button></li>)}</ul></li>)}</ul></Card>}
      {!d.canReview && <Notice>You can read the queue but not change it, and author names are hidden.</Notice>}
      {d.items.length === 0 ? <EmptyState icon="inbox" title="No suggestions match">Nothing here yet, or try other filters.</EmptyState> : <ul className="plain stack-sm">{d.items.map((r) => <li key={r.id}><Card as="article" className="stack-sm">
        <div className="spread"><h3 className="h-sm"><button type="button" className="linklike" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{r.title}</button></h3><StatusBadge s={r.status} /></div>
        <p className="faint">{categoryLabel(r.category)}{r.area ? ` · ${r.area}` : ''} · {timeAgo(r.createdAt, Date.now())}{r.author ? ` · @${r.author.handle}` : ''}</p>
        {open === r.id && <Detail id={r.id} canReview={d.canReview} all={d.items} onChanged={res.reload} />}</Card></li>)}</ul>}</>}</Async></div>;
}

function Detail({ id, canReview, all, onChanged }: { id: string; canReview: boolean; all: Row[]; onChanged: () => void }) {
  const { say } = useToast(); const res = useResource(() => api.get<{ suggestion: StaffSuggestionView }>(`/api/founder/suggestions/${id}`), [id]);
  const [status, setStatus] = useState(''); const [pub, setPub] = useState(''); const [internal, setInternal] = useState(''); const [target, setTarget] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); try { await api.post(`/api/founder/suggestions/${id}/update`, { ...(status ? { status } : {}), ...(pub.trim() ? { publicNote: pub } : {}), ...(internal.trim() ? { internalNote: internal } : {}), ...(status === 'merged' ? { mergedInto: target } : {}) }); say('Saved'); setStatus(''); setPub(''); setInternal(''); setTarget(''); res.reload(); onChanged(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return <Async res={res}>{({ suggestion: s }) => <div className="stack-sm">
    <p style={{ whiteSpace: 'pre-wrap' }}>{s.body}</p>{s.extra && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}><strong>Extra:</strong> {s.extra}</p>}
    {s.updates.length > 0 && <ol className="plain stack-sm" aria-label="History">{s.updates.map((u) => <li key={u.id}><span className="faint">{timeAgo(u.at, Date.now())}{u.by ? ` · @${u.by}` : ''}</span> {u.status && <strong>{statusLabel(u.status)}. </strong>}{u.note}{u.internalNote && <span className="faint"> (internal: {u.internalNote})</span>}</li>)}</ol>}
    {canReview && <fieldset className="stack-sm fieldset"><legend>Update this suggestion</legend>
      <SelectField label="Change status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Keep “{statusLabel(s.status)}”</option>{SUGGESTION_STATUSES.filter((x) => x[0] !== s.status).map(([i, l, h]) => <option key={i} value={i}>{l} — {h}</option>)}</SelectField>
      {status === 'merged' && <SelectField label="Merge into" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose…</option>{all.filter((x) => x.id !== id && x.status !== 'merged').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</SelectField>}
      <TextArea label={status === 'declined' ? 'Reason for declining (shown to the author, required)' : 'Note to the author (optional, shown to them)'} value={pub} onChange={(e) => setPub(e.target.value)} rows={2} maxLength={600} />
      <TextArea label="Internal note (only reviewers see this)" value={internal} onChange={(e) => setInternal(e.target.value)} rows={2} maxLength={1000} />
      <div><Button variant="primary" busy={busy} disabled={!status && !pub.trim() && !internal.trim()} onClick={() => void save()}>Save update</Button></div></fieldset>}
  </div>}</Async>;
}
void Badge;
