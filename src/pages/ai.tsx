import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../api/client';
import { Link, navigate } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Async, Badge, Button, Card, Chip, Confirm, EmptyState, Notice, PageHead, SelectField, Switch, TextArea, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { timeAgo } from '../lib/time';
import { AI_LIMITS, type AgentCard, type AiConversationView, type AiMessageView, type AiSendResult, type CrisisResource } from '../../shared/api/ai';

type P = { params: Record<string, string>; query: URLSearchParams };
interface Info { mode: 'demo' | 'live'; provider: string; honesty: string; disclosure: string; flagRetentionDays: number; resources: CrisisResource[]; dailyCap: number; history: { saveHistory: boolean; retentionDays: number | null }; tools: { journal: boolean; goals: boolean; habits: boolean } }

export const ModeBanner = ({ info }: { info: Info }) => <Notice tone={info.mode === 'demo' ? 'demo' : 'info'} title={info.mode === 'demo' ? 'Demo mode: no AI model is connected' : 'AI model connected'}>{info.honesty}</Notice>;
const Resources = ({ list }: { list: CrisisResource[] }) => <ul className="plain stack-sm">{list.map((r) => <li key={r.label}><strong>{r.label}</strong> <span className="muted">{r.detail}</span>{r.url && <> <a href={r.url} target="_blank" rel="noopener noreferrer">{r.url.replace(/^https?:\/\//, '')}</a></>}</li>)}</ul>;

// ───────── Nova home: history ─────────
export function NovaPage(_: P) {
  const { say } = useToast(); const info = useResource(() => api.get<Info>('/api/ai/info'), []); const [q, setQ] = useState(''); const [applied, setApplied] = useState('');
  const list = useResource(() => api.get<{ items: AiConversationView[] }>(`/api/ai/conversations${qs({ q: applied || undefined })}`), [applied]);
  const [renaming, setRenaming] = useState<string | null>(null); const [title, setTitle] = useState(''); const [del, setDel] = useState<AiConversationView | null>(null); const [all, setAll] = useState(false); const [confirmTxt, setConfirmTxt] = useState('');
  const create = async () => { try { const r = await api.post<{ conversation: AiConversationView }>('/api/ai/conversations', {}); navigate(`/ai/chat/${r.conversation.id}`); } catch (e) { say(errMsg(e), 'error'); } };
  return (
    <div className="stack-lg"><PageHead title="Nova" actions={info.data?.history.saveHistory === false ? <Link className="btn btn-primary" to="/ai/chat/temporary">Temporary chat</Link> : <Button variant="primary" onClick={() => void create()}><Icon name="plus" size={16} /> New conversation</Button>}>Your companion for thinking things through. For specialist help, see the <Link to="/ai/council">AI Council</Link>.</PageHead>
      <Async res={info}>{(i) => <><ModeBanner info={i} />
        <details className="card"><summary>How your conversations are handled</summary><p>{i.disclosure}</p><p className="muted">History is {i.history.saveHistory ? 'saved' : 'off'}{i.history.retentionDays ? `, deleted after ${i.history.retentionDays} days` : ''}. Change this in <Link to="/settings/nova">Settings → Nova</Link>.</p></details>
        <div className="row-wrap"><Link className="chip chip-link" to="/ai/journal">Journal {i.tools.journal ? '' : '(off)'}</Link><Link className="chip chip-link" to="/ai/goals">Goals {i.tools.goals ? '' : '(off)'}</Link><Link className="chip chip-link" to="/ai/habits">Habits {i.tools.habits ? '' : '(off)'}</Link></div></>}</Async>
      <form className="row-wrap" role="search" onSubmit={(e) => { e.preventDefault(); setApplied(q); }}><TextField label="Search your conversations" value={q} onChange={(e) => setQ(e.target.value)} /><Button type="submit">Search</Button></form>
      <Async res={list} empty={(d) => (d.items.length ? null : <EmptyState icon="nova" title={applied ? 'No conversations match' : 'No conversations yet'}>{applied ? 'Try another word.' : 'Start one whenever you like.'}</EmptyState>)}>{(d) => <ul className="plain stack-sm">{d.items.map((c) => <li key={c.id} className="card spread">
        {renaming === c.id ? <form className="row-wrap" onSubmit={async (e) => { e.preventDefault(); try { await api.patch(`/api/ai/conversations/${c.id}`, { title }); setRenaming(null); list.reload(); } catch (er) { say(errMsg(er), 'error'); } }}><TextField label="Title" value={title} maxLength={AI_LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} /><Button type="submit" size="sm" variant="primary">Save</Button><Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button></form>
          : <><div><Link to={`/ai/chat/${c.id}`}><strong>{c.pinned ? '📌 ' : ''}{c.title}</strong></Link><div className="faint">{c.agentId} · {c.messageCount} messages · {timeAgo(c.updatedAt, Date.now())}</div>{c.preview && <div className="muted ellipsis">{c.preview}</div>}</div>
            <div className="row-wrap"><Button size="sm" variant="ghost" onClick={async () => { await api.patch(`/api/ai/conversations/${c.id}`, { pinned: !c.pinned }); list.reload(); }}>{c.pinned ? 'Unpin' : 'Pin'}</Button><Button size="sm" variant="ghost" onClick={() => { setRenaming(c.id); setTitle(c.title); }}>Rename</Button><Button size="sm" variant="ghost" onClick={() => setDel(c)}>Delete</Button></div></>}</li>)}</ul>}</Async>
      {list.data && list.data.items.length > 0 && <Button variant="ghost" onClick={() => setAll(true)}>Delete all conversations…</Button>}
      <Confirm open={!!del} danger title="Delete this conversation?" confirmLabel="Delete" onConfirm={async () => { const r = await api.del<{ note: string }>(`/api/ai/conversations/${del!.id}`); say(r.note); list.reload(); }} onClose={() => setDel(null)}>This removes it from your history. If a safety excerpt was kept, it expires within the period disclosed above, so deletion here may not remove it immediately.</Confirm>
      <Confirm open={all} danger title="Delete all conversations?" confirmLabel="Delete all" onConfirm={async () => { if (confirmTxt !== 'DELETE ALL') throw new Error('Type DELETE ALL to confirm.'); await api.post('/api/ai/conversations/delete-all', { confirm: 'DELETE ALL' }); setConfirmTxt(''); list.reload(); }} onClose={() => setAll(false)}><TextField label="Type DELETE ALL to confirm" value={confirmTxt} onChange={(e) => setConfirmTxt(e.target.value)} /></Confirm>
    </div>
  );
}

// ───────── Chat ─────────
export function NovaChatPage({ params, query }: P) {
  const { say } = useToast(); const temp = params.id === 'temporary'; const agent = query.get('agent') ?? 'nova';
  const conv = useResource(() => (temp ? Promise.resolve(null) : api.get<{ conversation: AiConversationView; messages: AiMessageView[] }>(`/api/ai/conversations/${params.id}`)), [params.id]);
  const info = useResource(() => api.get<Info>('/api/ai/info'), []);
  const [local, setLocal] = useState<AiMessageView[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [safety, setSafety] = useState<AiSendResult['safety']>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (conv.data) setLocal(conv.data.messages); }, [conv.data]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [local.length]);
  const send = async () => {
    const t = text.trim(); if (!t) return; setBusy(true);
    try {
      if (temp) {
        const mine: AiMessageView = { id: `u${local.length}`, role: 'user', body: t, createdAt: new Date().toISOString(), meta: {} }; const next = [...local, mine]; setLocal(next); setText('');
        const r = await api.post<{ text: string; mode: 'live' | 'demo' | 'safety'; safety: AiSendResult['safety'] }>('/api/ai/chat', { agentId: agent, messages: next.filter((m) => m.role !== 'notice').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.body })).slice(-20) });
        setLocal([...next, { id: `a${next.length}`, role: r.mode === 'safety' ? 'notice' : 'assistant', body: r.text, createdAt: new Date().toISOString(), meta: { mode: r.mode === 'safety' ? undefined : r.mode, agentId: agent } }]); setSafety(r.safety);
      } else {
        const r = await api.post<AiSendResult>(`/api/ai/conversations/${params.id}/messages`, { body: t }); setText(''); setLocal((m) => [...m, ...(r.userMessage ? [r.userMessage] : []), r.assistantMessage]); setSafety(r.safety);
      }
    } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <PageHead title={temp ? 'Temporary chat' : conv.data?.conversation.title ?? 'Nova'} back={{ to: '/ai', label: 'Nova' }}>{temp ? 'Nothing here is saved. It disappears when you leave.' : ''}</PageHead>
      {info.data && <ModeBanner info={info.data} />}
      {conv.error != null && !temp && <Notice tone="warn">{errMsg(conv.error)}</Notice>}
      <div className="thread" role="log" aria-live="polite" aria-label="Conversation">
        {local.length === 0 && <p className="muted">Say what’s on your mind. Nova can be wrong, and isn’t a doctor, lawyer or therapist.</p>}
        {local.map((m) => m.role === 'notice' ? <div key={m.id} className="notice notice-warn" role="note">{m.body}</div> : <div key={m.id} className={`bubble ${m.role === 'user' ? 'mine' : 'theirs'}`}>{m.body}{m.role === 'assistant' && <div className="faint small">{m.meta.mode === 'demo' ? 'Demo reply (scripted, not real AI)' : 'AI reply'}</div>}</div>)}
        <div ref={end} />
      </div>
      {safety && <Card className="notice notice-warn"><h2 className="h-sm">If you’re struggling, you don’t have to handle it alone</h2><Resources list={safety.resources} /></Card>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}><TextArea label="Message Nova" value={text} onChange={(e) => setText(e.target.value)} maxLength={AI_LIMITS.messageMax} rows={3} /><Button type="submit" variant="primary" busy={busy} disabled={!text.trim()}>Send</Button></form>
    </div>
  );
}

// ───────── Personal tools ─────────
function ToolGate({ tool, label, children }: { tool: 'journalEnabled' | 'goalsEnabled' | 'habitsEnabled'; label: string; children: React.ReactNode }) {
  const { say } = useToast(); const res = useResource(() => api.get<{ settings: { nova: Record<string, boolean> } }>('/api/settings'), []);
  return <Async res={res}>{(d) => d.settings.nova[tool] ? <>{children}</> : (
    <div className="stack"><Notice title={`${label} is off`}>It’s private to you and off until you turn it on. Moderators, governance roles and the Founder can’t read it, and nothing is ever posted automatically.</Notice>
      <Button variant="primary" onClick={async () => { try { await api.patch('/api/settings', { nova: { [tool]: true } }); res.reload(); } catch (e) { say(errMsg(e), 'error'); } }}>Turn on {label.toLowerCase()}</Button></div>)}</Async>;
}
const ToolHead = ({ title, children }: { title: string; children: string }) => <PageHead title={title} back={{ to: '/ai', label: 'Nova' }}>{children}</PageHead>;
const EraseButton = ({ tool, onDone }: { tool: 'journal' | 'goals' | 'habits'; onDone: () => void }) => { const [o, setO] = useState(false); const [t, setT] = useState(''); return <><Button variant="ghost" onClick={() => setO(true)}>Erase all {tool}…</Button><Confirm open={o} danger title={`Erase all ${tool}?`} confirmLabel="Erase" onConfirm={async () => { if (t !== 'ERASE') throw new Error('Type ERASE to confirm.'); await api.post(`/api/personal/${tool}/erase`, { confirm: 'ERASE' }); setT(''); onDone(); }} onClose={() => setO(false)}><TextField label="Type ERASE to confirm" value={t} onChange={(e) => setT(e.target.value)} /></Confirm></>; };

export function JournalPage(_: P) {
  const { say } = useToast(); const [q, setQ] = useState('');
  return <div className="stack-lg"><ToolHead title="Journal">Private writing. Only you can read it. You can choose to share one entry with Nova in a conversation.</ToolHead>
    <ToolGate tool="journalEnabled" label="Journal"><JournalBody q={q} setQ={setQ} say={say} /></ToolGate></div>;
}
function JournalBody({ q, setQ, say }: { q: string; setQ: (s: string) => void; say: (m: string, t?: 'error') => void }) {
  const res = useResource(() => api.get<{ items: { id: string; title: string | null; body: string; createdAt: string }[] }>(`/api/journal${qs({ q: q || undefined })}`), [q]);
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [edit, setEdit] = useState<string | null>(null);
  const save = async () => { try { if (edit) await api.patch(`/api/journal/${edit}`, { title: title || null, body }); else await api.post('/api/journal', { title: title || undefined, body }); setTitle(''); setBody(''); setEdit(null); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <>
    <Card className="stack-sm"><h2 className="h-sm">{edit ? 'Edit entry' : 'New entry'}</h2><TextField label="Title" optional value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /><TextArea label="What’s on your mind?" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={10000} /><div className="row-wrap"><Button variant="primary" disabled={!body.trim()} onClick={() => void save()}>Save entry</Button>{edit && <Button variant="ghost" onClick={() => { setEdit(null); setTitle(''); setBody(''); }}>Cancel</Button>}</div></Card>
    <TextField label="Search entries" value={q} onChange={(e) => setQ(e.target.value)} />
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="edit" title="No entries yet" />)}>{(d) => <ul className="plain stack-sm">{d.items.map((j) => <li key={j.id} className="card"><div className="spread"><strong>{j.title ?? 'Untitled'}</strong><span className="faint">{new Date(j.createdAt).toLocaleDateString()}</span></div><p className="post-body">{j.body}</p><div className="row-wrap"><Button size="sm" variant="ghost" onClick={() => { setEdit(j.id); setTitle(j.title ?? ''); setBody(j.body); }}>Edit</Button><Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/journal/${j.id}`); res.reload(); }}>Delete</Button></div></li>)}</ul>}</Async>
    <EraseButton tool="journal" onDone={res.reload} /></>;
}

interface Goal { id: string; title: string; description: string | null; status: string; targetDate: string | null; steps: { id: string; title: string; done: boolean }[] }
export function GoalsPage(_: P) { return <div className="stack-lg"><ToolHead title="Goals">Private goals with small steps. Never shared or posted.</ToolHead><ToolGate tool="goalsEnabled" label="Goals"><GoalsBody /></ToolGate></div>; }
function GoalsBody() {
  const { say } = useToast(); const res = useResource(() => api.get<{ items: Goal[] }>('/api/goals'), []); const [title, setTitle] = useState(''); const [steps, setSteps] = useState(''); const [step, setStep] = useState<Record<string, string>>({});
  const patch = async (id: string, b: object) => { try { await api.patch(`/api/goals/${id}`, b); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <>
    <form className="card stack-sm" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/api/goals', { title, steps: steps.split('\n').map((s) => s.trim()).filter(Boolean) }); setTitle(''); setSteps(''); res.reload(); } catch (er) { say(errMsg(er), 'error'); } }}><h2 className="h-sm">New goal</h2><TextField label="Goal" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /><TextArea label="Steps" optional hint="One per line" value={steps} onChange={(e) => setSteps(e.target.value)} rows={3} /><Button type="submit" variant="primary" disabled={title.trim().length < 2} style={{ justifySelf: 'start' }}>Add goal</Button></form>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="target" title="No goals yet" />)}>{(d) => <ul className="plain stack-sm">{d.items.map((g) => { const done = g.steps.filter((s) => s.done).length; return <li key={g.id} className="card stack-sm"><div className="spread"><strong>{g.title}</strong><Badge>{g.status}</Badge></div>
      {g.steps.length > 0 && <><div className="progress" role="progressbar" aria-label={`${g.title} progress`} aria-valuenow={Math.round((done / g.steps.length) * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${(done / g.steps.length) * 100}%` }} /></div>{g.steps.map((s) => <label key={s.id} className="radio-row"><input type="checkbox" checked={s.done} onChange={() => void patch(g.id, { toggleStep: s.id })} /><span>{s.title}</span></label>)}</>}
      <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); if (step[g.id]?.trim()) { void patch(g.id, { addStep: step[g.id] }); setStep({ ...step, [g.id]: '' }); } }}><TextField label="Add a step" value={step[g.id] ?? ''} onChange={(e) => setStep({ ...step, [g.id]: e.target.value })} /><Button size="sm" type="submit">Add</Button></form>
      <div className="row-wrap"><SelectField label="Status" value={g.status} onChange={(e) => void patch(g.id, { status: e.target.value })}>{['active', 'paused', 'done', 'dropped'].map((s) => <option key={s}>{s}</option>)}</SelectField><Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/goals/${g.id}`); res.reload(); }}>Delete</Button></div></li>; })}</ul>}</Async>
    <EraseButton tool="goals" onDone={res.reload} /></>;
}

interface Habit { id: string; title: string; cadence: string; doneToday: boolean; last7: number; current: number; best: number; targetPerWeek: number; days: number[]; timeOfDay: string | null; timezone: string; reminder: boolean; scheduledToday: boolean; dueNow: boolean }
export function HabitsPage(_: P) { return <div className="stack-lg"><ToolHead title="Habits">Gentle tracking. A missed day isn’t failure, and there are no points or leaderboards.</ToolHead><ToolGate tool="habitsEnabled" label="Habits"><HabitsBody /></ToolGate></div>; }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtTime = (t: string | null) => { if (!t) return ''; const h = Number(t.slice(0, 2)), m = t.slice(3); return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`; };
const myTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
function HabitForm({ init, onSave, onCancel, label }: { init?: Habit; onSave: (b: { title: string; days: number[]; timeOfDay: string | null; timezone: string; reminder: boolean }) => Promise<void>; onCancel?: () => void; label: string }) {
  const [title, setTitle] = useState(init?.title ?? ''); const [days, setDays] = useState<number[]>(init?.days ?? []); const [time, setTime] = useState(init?.timeOfDay ?? ''); const [rem, setRem] = useState(init?.reminder ?? false); const tz = init?.timezone ?? myTz();
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  return <form className="card stack-sm" onSubmit={(e) => { e.preventDefault(); void onSave({ title, days, timeOfDay: time || null, timezone: tz, reminder: rem && !!time }); }}>
    <TextField label={init ? 'Habit' : 'New habit'} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
    <fieldset className="fieldset"><legend>Which days</legend><div className="row-wrap">{WD.map((n, d) => <Chip key={n} on={days.includes(d)} onClick={() => toggle(d)}>{n}</Chip>)}</div><p className="hint">{days.length === 0 ? 'Every day' : `${days.length} day${days.length > 1 ? 's' : ''} a week`}. Leave empty for every day.</p></fieldset>
    <TextField label="Time (optional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint={time ? `${fmtTime(time)} in your time zone (${tz})` : `Your time zone: ${tz}`} />
    <Switch label="Remind me" checked={rem && !!time} disabled={!time} onChange={setRem} hint="Reminders appear at the top of this page once the time has passed and the habit isn’t done. Push and email reminders aren’t built yet." />
    <div className="row-wrap"><Button type="submit" variant="primary" disabled={title.trim().length < 2}>{label}</Button>{onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}</div></form>;
}
function HabitsBody() {
  const { say } = useToast(); const res = useResource(() => api.get<{ items: Habit[] }>('/api/habits'), []); const [edit, setEdit] = useState<string | null>(null); const [del, setDel] = useState<Habit | null>(null);
  const failed = (er: unknown) => say(errMsg(er), 'error');
  return <>
    <Async res={res}>{(d) => d.items.some((h) => h.dueNow) ? <Notice tone="info" title="Due now">{d.items.filter((h) => h.dueNow).map((h) => `${h.title} (${fmtTime(h.timeOfDay)})`).join(' · ')}</Notice> : null}</Async>
    <HabitForm label="Add habit" onSave={async (b) => { try { await api.post('/api/habits', { ...b, cadence: 'daily', targetPerWeek: b.days.length || 7 }); res.reload(); } catch (er) { failed(er); } }} />
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="check" title="No habits yet" />)}>{(d) => <ul className="plain stack-sm">{d.items.map((h) => <li key={h.id}>{edit === h.id ? <HabitForm init={h} label="Save" onCancel={() => setEdit(null)} onSave={async (b) => { try { await api.patch(`/api/habits/${h.id}`, b); setEdit(null); res.reload(); say('Saved'); } catch (er) { failed(er); } }} /> :
      <div className="card spread"><div><strong>{h.title}</strong><div className="faint">{h.days.length ? h.days.map((x) => WD[x]).join(', ') : 'Every day'}{h.timeOfDay ? ` · ${fmtTime(h.timeOfDay)}` : ''}{h.reminder ? ' · reminder on' : ''}{!h.scheduledToday ? ' · not scheduled today' : ''}</div><div className="faint">{h.last7} of the last 7 days · streak {h.current} (best {h.best})</div></div>
        <div className="row-wrap"><Button size="sm" variant={h.doneToday ? 'secondary' : 'primary'} aria-pressed={h.doneToday} onClick={async () => { try { await api.post(`/api/habits/${h.id}/checkin`, { undo: h.doneToday }); res.reload(); } catch (e) { failed(e); } }}>{h.doneToday ? 'Done today ✓' : 'Check in'}</Button><Button size="sm" variant="ghost" onClick={() => setEdit(h.id)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDel(h)}>Delete</Button></div></div>}</li>)}</ul>}</Async>
    {del && <Confirm open title={`Delete “${del.title}”?`} confirmLabel="Delete habit" danger onConfirm={async () => { await api.del(`/api/habits/${del.id}`); setDel(null); res.reload(); }} onClose={() => setDel(null)}><p>The habit is removed from your list. Your check-in history for it is kept private and isn’t shown anywhere.</p></Confirm>}
    <EraseButton tool="habits" onDone={res.reload} /></>;
}

// ───────── AI Council ─────────
const STATE_LABEL: Record<string, string> = { unavailable: 'Not available', available: 'Built, not configured', configured: 'Configured, not verified', operational: 'Operational', demo: 'Demo only' };
const stateTone = (s: string) => (s === 'operational' ? 'ok' : s === 'demo' ? 'demo' : s === 'unavailable' ? 'warn' : undefined) as 'ok' | 'demo' | 'warn' | undefined;
export function CouncilPage(_: P) {
  const res = useResource(() => api.get<{ agents: AgentCard[]; honesty: string; states: Record<string, string> }>('/api/council'), []); const [text, setText] = useState(''); const [route, setRoute] = useState<null | { decision: any; agent: AgentCard | null }>(null); const { say } = useToast();
  return <div className="stack-lg"><PageHead title="AI Council">Nine specialists, each with a clear job. Nova is your companion; the Council is for focused help. They advise. They never act for you.</PageHead>
    <Async res={res}>{(d) => <>
      <Notice tone={d.honesty.includes('no AI model') ? 'demo' : 'info'}>{d.honesty}</Notice>
      <Card className="stack-sm"><h2 className="h-sm">Not sure who to ask?</h2><form className="row-wrap" onSubmit={async (e) => { e.preventDefault(); try { setRoute(await api.post('/api/council/route', { text })); } catch (er) { say(errMsg(er), 'error'); } }}><TextField label="Describe what you need" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /><Button type="submit" disabled={!text.trim()}>Suggest a specialist</Button></form>
        {route && (route.agent ? <p>Best fit: <Link to={`/ai/council/${route.agent.id}`}><strong>{route.agent.name}</strong></Link> ({route.agent.title}). <span className="muted">{route.decision.reason ?? ''}</span></p> : <p className="muted">No specialist is a clear match, so Nova is the best place to start.</p>)}</Card>
      <div className="grid-cards">{d.agents.map((a) => <Card as="article" key={a.id}><div className="spread"><h2 className="h-sm"><Link to={`/ai/council/${a.id}`}>{a.name}</Link></h2><Badge tone={stateTone(a.state)}>{STATE_LABEL[a.state] ?? a.state}</Badge></div><p className="muted">{a.title}</p><p>{a.tagline}</p>{!a.available && a.unavailableReason && <p className="faint">{a.unavailableReason}</p>}</Card>)}</div>
      <details className="card"><summary>What the states mean</summary><ul>{Object.entries(d.states).map(([k, v]) => <li key={k}><strong>{STATE_LABEL[k] ?? k}:</strong> {v}</li>)}</ul></details></>}</Async></div>;
}
export function CouncilAgentPage({ params }: P) {
  const res = useResource(() => api.get<{ agents: AgentCard[] }>('/api/council'), []); const { say } = useToast();
  return <Async res={res}>{(d) => { const a = d.agents.find((x) => x.id === params.agent); if (!a) return <EmptyState title="Specialist not found" icon="council"><Link to="/ai/council">Back to the Council</Link></EmptyState>;
    return <div className="stack-lg"><PageHead title={a.name} back={{ to: '/ai/council', label: 'AI Council' }}>{a.title}. {a.tagline}</PageHead>
      <div className="row-wrap"><Badge tone={stateTone(a.state)}>{STATE_LABEL[a.state] ?? a.state}</Badge>{!a.enabled && <Badge tone="warn">Switched off</Badge>}</div>
      {!a.available && <Notice tone="warn">{a.unavailableReason ?? 'This specialist isn’t available right now.'} You can still talk to Nova.</Notice>}
      <Card><h2 className="h-sm">What {a.name} helps with</h2><ul>{a.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul></Card>
      <Card><h2 className="h-sm">What works today</h2><ul className="plain stack-sm">{a.capabilities.map((c) => <li key={c.id}><strong>{c.label}</strong> <Badge tone={stateTone(c.state)}>{STATE_LABEL[c.state] ?? c.state}</Badge><div className="muted">{c.detail}</div></li>)}</ul></Card>
      <Card><h2 className="h-sm">What it may and may not do</h2><ul className="plain">{a.toolPermissions.map((t) => <li key={t.tool}>{t.allowed ? '✓' : '✗'} {t.tool}{t.note ? ` — ${t.note}` : ''}</li>)}</ul></Card>
      <Button variant="primary" disabled={!a.available} onClick={async () => { try { const r = await api.post<{ conversation: AiConversationView }>('/api/ai/conversations', { agentId: a.id }); navigate(`/ai/chat/${r.conversation.id}?agent=${a.id}`); } catch (e) { const m = errMsg(e); if (/history/i.test(m)) navigate(`/ai/chat/temporary?agent=${a.id}`); else say(m, 'error'); } }}>Start a conversation with {a.name}</Button></div>; }}</Async>;
}
export { Chip, Switch };
