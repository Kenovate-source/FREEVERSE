import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { Async, Badge, Button, Card, Chip, Notice, SelectField, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { AUDIENCE_LABEL, type Audience } from '../../shared/constants';
import { LABEL_STAGES, LABEL_STAGE_TEXT, type LabelStage } from '../../shared/identity-labels';

interface Mine { id: string; key: string; label: string; category: string | null; isCustom: boolean; stage: LabelStage; note: string | null; visibility: Audience }
const AUDS: Audience[] = ['everyone', 'members', 'connections', 'only_me'];

/** Manage "how I describe myself": searchable catalogue, own words, a stage that can change, and who sees each label. */
export function IdentityLabelsCard() {
  const { say } = useToast();
  const cat = useResource(() => api.get<{ categories: { id: string; label: string }[]; items: { key: string; label: string; category: string }[]; limits: { max: number; labelMax: number; noteMax: number } }>('/api/catalog/identity-labels'), []);
  const mine = useResource(() => api.get<{ items: Mine[] }>('/api/me/identity-labels'), []);
  const [q, setQ] = useState(''); const [stage, setStage] = useState<LabelStage>('current'); const [custom, setCustom] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); try { await fn(); if (ok) say(ok); mine.reload(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  const have = new Set(mine.data?.items.map((i) => i.key) ?? []);
  const matches = useMemo(() => {
    const items = cat.data?.items ?? []; const n = q.trim().toLowerCase(); const cats = new Map((cat.data?.categories ?? []).map((c) => [c.id, c.label.toLowerCase()]));
    return (n ? items.filter((i) => i.label.toLowerCase().includes(n) || (cats.get(i.category) ?? '').includes(n)) : items).filter((i) => !have.has(i.key)).slice(0, 40);
  }, [cat.data, q, mine.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Card className="stack" as="section" aria-labelledby="idl-h"><h2 id="idl-h" className="h-sm">How you describe yourself</h2>
    <p className="muted">Beyond the identity spaces above: pick from a wide list or use your own words. You can be many things at once, be working towards something, or just be exploring, and you can change any of it later.</p>
    <Notice>These are your own words about yourself. They never give you a role, permission or access, and nobody has verified them.</Notice>
    <Async res={mine} empty={(d) => (d.items.length ? null : <p className="muted">Nothing here yet. Add what feels true, or what you’d like to try on.</p>)}>{(d) => <div className="stack-sm">{LABEL_STAGES.map((s) => { const group = d.items.filter((i) => i.stage === s); if (!group.length) return null; return (
      <section key={s} aria-label={LABEL_STAGE_TEXT[s].title}><h3 className="h-sm">{LABEL_STAGE_TEXT[s].title} <span className="faint">· {LABEL_STAGE_TEXT[s].help}</span></h3>
        <ul className="plain stack-sm">{group.map((i) => <li key={i.id} className="card stack-sm"><div className="spread"><div><strong>{i.label}</strong>{i.isCustom && <> <Badge>Your words</Badge></>}{i.note && <div className="muted">{i.note}</div>}</div>
          <div className="row-wrap"><SelectField label="Stage" value={i.stage} onChange={(e) => void act(() => api.patch(`/api/me/identity-labels/${i.id}`, { stage: e.target.value }), 'Updated')}>{LABEL_STAGES.map((x) => <option key={x} value={x}>{LABEL_STAGE_TEXT[x].title}</option>)}</SelectField>
            <SelectField label="Seen by" value={i.visibility} onChange={(e) => void act(() => api.patch(`/api/me/identity-labels/${i.id}`, { visibility: e.target.value }), 'Updated')}>{AUDS.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</SelectField>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => api.del(`/api/me/identity-labels/${i.id}`), 'Removed')} aria-label={`Remove ${i.label}`}>Remove</Button></div></div></li>)}</ul></section>); })}</div>}</Async>
    <fieldset className="stack-sm fieldset"><legend>Add one</legend>
      <SelectField label="This is…" value={stage} onChange={(e) => setStage(e.target.value as LabelStage)}>{LABEL_STAGES.map((x) => <option key={x} value={x}>{LABEL_STAGE_TEXT[x].title}: {LABEL_STAGE_TEXT[x].help}</option>)}</SelectField>
      <TextField label="Search the list" value={q} onChange={(e) => setQ(e.target.value)} hint="Try “maker”, “volunteer”, “research” or a category like “creative”." />
      <Async res={cat}>{() => <div className="row-wrap chip-cloud" role="group" aria-label="Matching labels">{matches.length === 0 ? <span className="muted">Nothing in the list matches. Use your own words below.</span> : matches.map((i) => <Chip key={i.key} onClick={() => void act(() => api.post('/api/me/identity-labels', { key: i.key, stage }), `Added “${i.label}”`)}>{i.label}</Chip>)}</div>}</Async>
      <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); if (custom.trim().length >= 2) void act(async () => { await api.post('/api/me/identity-labels', { custom: custom.trim(), stage, ...(note.trim() ? { note: note.trim() } : {}) }); setCustom(''); setNote(''); }, 'Added'); }}>
        <TextField label="Or describe yourself in your own words" value={custom} maxLength={cat.data?.limits.labelMax ?? 40} onChange={(e) => setCustom(e.target.value)} />
        <TextField label="A line about it (optional)" optional value={note} maxLength={cat.data?.limits.noteMax ?? 200} onChange={(e) => setNote(e.target.value)} />
        <div><Button type="submit" variant="primary" busy={busy} disabled={custom.trim().length < 2}>Add in my own words</Button></div></form></fieldset></Card>;
}

/** Read-only view of another person's labels (already filtered by the server to what you may see). */
export function ProfileLabels({ items }: { items: { id: string; label: string; stage: LabelStage; note: string | null; isCustom: boolean }[] }) {
  if (!items.length) return null;
  return <Card className="stack-sm"><h2 className="h-sm">In their own words</h2>{LABEL_STAGES.map((s) => { const g = items.filter((i) => i.stage === s); return g.length ? <div key={s}><span className="faint">{LABEL_STAGE_TEXT[s].sentence}: </span><span className="row-wrap" style={{ display: 'inline-flex' }}>{g.map((i) => <Badge key={i.id} tone={s === 'current' ? 'cyan' : s === 'aspiring' ? 'violet' : undefined}>{i.label}</Badge>)}</span></div> : null; })}
    <p className="faint">Self-declared. Not verified, and not a platform role.</p></Card>;
}
