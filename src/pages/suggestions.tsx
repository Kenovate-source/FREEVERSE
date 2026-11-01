import { useState } from 'react';
import { api } from '../api/client';
import { Async, Badge, Button, Card, Confirm, EmptyState, Notice, PageHead, SelectField, TextArea, TextField, errMsg, fieldErrors, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { timeAgo } from '../lib/time';
import { SUGGESTION_CATEGORIES, SUGGESTION_LIMITS as L, SUGGESTION_STATUSES, categoryLabel, statusLabel, type SuggestionView } from '../../shared/suggestions';

export const StatusBadge = ({ s }: { s: string }) => <Badge tone={s === 'completed' ? 'ok' : s === 'planned' || s === 'in_progress' ? 'cyan' : s === 'declined' ? 'warn' : undefined}>{statusLabel(s)}</Badge>;

export function SuggestionsPage(_: { params: Record<string, string>; query: URLSearchParams }) {
  const { say } = useToast(); const mine = useResource(() => api.get<{ items: SuggestionView[]; note: string }>('/api/suggestions/mine'), []);
  const [f, setF] = useState({ title: '', body: '', category: '', area: '', extra: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [fe, setFe] = useState<Record<string, string>>({}); const [del, setDel] = useState<SuggestionView | null>(null);
  const submit = async () => {
    const local: Record<string, string> = {};
    if (f.title.trim().length < L.titleMin) local.title = `Give it a short title (at least ${L.titleMin} characters).`; if (f.body.trim().length < L.bodyMin) local.body = `Tell us a little more (at least ${L.bodyMin} characters).`; if (!f.category) local.category = 'Choose what this is about.';
    setFe(local); if (Object.keys(local).length) { setErr('Please fix the highlighted fields.'); return; }
    setBusy(true); setErr(null);
    try { await api.post('/api/suggestions', { title: f.title, body: f.body, category: f.category, ...(f.area.trim() ? { area: f.area } : {}), ...(f.extra.trim() ? { extra: f.extra } : {}) }); setF({ title: '', body: '', category: '', area: '', extra: '' }); say('Thank you. Your suggestion was sent.'); mine.reload(); }
    catch (e) { setErr(errMsg(e)); setFe(fieldErrors(e)); } finally { setBusy(false); }
  };
  return <div className="stack-lg"><PageHead title="Suggest an improvement">Tell us what would make FREEVERSE better. Suggestions are private: only you and a small review group can read them. We read them all, but we can’t promise to build every one.</PageHead>
    <Card className="stack" as="section" aria-label="New suggestion">
      <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={L.titleMax} error={fe.title} />
      <TextArea label="What would you like, and why?" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={5} maxLength={L.bodyMax} error={fe.body} hint={`${f.body.length}/${L.bodyMax}`} />
      <div className="grid-2"><SelectField label="What is it about?" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} error={fe.category}><option value="">Choose…</option>{SUGGESTION_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</SelectField>
        <TextField label="Which part of FREEVERSE? (optional)" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} maxLength={L.areaMax} hint="For example: Communities, FreeLearn, Settings" /></div>
      <TextArea label="Anything that would help us understand? (optional)" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} rows={3} maxLength={L.extraMax} hint="Examples, links, or how you’d use it. Don’t include passwords or private details." />
      {err && <p className="error-text" role="alert">{err}</p>}<div><Button variant="primary" busy={busy} onClick={() => void submit()}>Send suggestion</Button></div></Card>
    <section className="stack" aria-labelledby="mine"><h2 id="mine" className="h-md">Your suggestions</h2>
      <Async res={mine} empty={(d) => (d.items.length ? null : <EmptyState icon="edit" title="Nothing sent yet">Your suggestions and what happens to them will appear here.</EmptyState>)}>{(d) => <ul className="plain stack-sm">{d.items.map((s) => <li key={s.id}><Card as="article" className="stack-sm">
        <div className="spread"><h3 className="h-sm">{s.title}</h3><StatusBadge s={s.status} /></div><p className="faint">{categoryLabel(s.category)}{s.area ? ` · ${s.area}` : ''} · sent {timeAgo(s.createdAt, Date.now())}</p>
        <p className="muted">{SUGGESTION_STATUSES.find((x) => x[0] === s.status)?.[2]}{s.mergedInto ? ` Merged into “${s.mergedInto.title}”.` : ''}</p>
        {s.updates.length > 0 && <ol className="plain stack-sm" aria-label="Updates">{s.updates.map((u) => <li key={u.id}><span className="faint">{timeAgo(u.at, Date.now())}</span> {u.status && <strong>{statusLabel(u.status)}. </strong>}{u.note}</li>)}</ol>}
        <div><Button size="sm" variant="ghost" onClick={() => setDel(s)}>Withdraw</Button></div></Card></li>)}</ul>}</Async></section>
    <Notice>Looking for help or want to report something? Use <a href="#/help">Help & safety</a>. Suggestions aren’t monitored for urgent problems.</Notice>
    <Confirm open={!!del} danger title="Withdraw this suggestion?" confirmLabel="Withdraw" onConfirm={async () => { await api.del(`/api/suggestions/${del!.id}`); say('Withdrawn'); mine.reload(); }} onClose={() => setDel(null)}>This deletes it and its updates. It can’t be undone.</Confirm></div>;
}
