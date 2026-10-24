import { useState } from 'react';
import { api } from '../../api/client';
import { Link } from '../../lib/router';
import { Async, Badge, Button, Card, EmptyState, Notice, TextField, useResource } from '../../ui/kit';
import { PostCard } from '../posts';
import { GamesHub } from '../games/Games';
import { budget, compoundGrowth, num, savingsGoal, type BudgetLine } from '../../lib/finance';
import type { FeedResponse } from '../../../shared/api/content';

// ───────── FreeFinance calculators ─────────
const money = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '–');

function BudgetTool() {
  const [income, setIncome] = useState(''); const [lines, setLines] = useState<{ name: string; amount: string }[]>([{ name: 'Rent or housing', amount: '' }, { name: 'Food', amount: '' }, { name: 'Transport', amount: '' }, { name: 'Savings', amount: '' }]);
  const r = budget(num(income), lines.map((l): BudgetLine => ({ name: l.name, amount: num(l.amount) })));
  return <Card className="stack"><h3 className="h-sm">Monthly budget</h3><p className="muted">Type your income and what you spend. Nothing is saved or sent anywhere.</p>
    <TextField label="Monthly income" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
    <div className="stack-sm">{lines.map((l, i) => <div key={i} className="row-wrap"><TextField label={`Item ${i + 1}`} value={l.name} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /><TextField label="Amount" inputMode="decimal" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /><Button size="sm" variant="ghost" aria-label={`Remove ${l.name || 'item'}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button></div>)}<Button size="sm" onClick={() => setLines([...lines, { name: '', amount: '' }])} style={{ justifySelf: 'start' }}>Add item</Button></div>
    <div aria-live="polite" className="stack-sm"><p>Total planned: <strong>{money(r.total)}</strong>{num(income) > 0 && <> · Left over: <strong className={r.overspent ? 'neg' : ''}>{money(r.remaining)}</strong></>}</p>
      {r.overspent && <Notice tone="warn">You’ve planned to spend more than you earn. Try trimming an item.</Notice>}
      {r.shares.length > 0 && <ul className="plain stack-sm">{r.shares.map((s, i) => <li key={i}><div className="spread"><span>{s.name}</span><span>{money(s.amount)} · {s.pct}%</span></div><div className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, s.pct)}%` }} /></div></li>)}</ul>}</div></Card>;
}
function GoalTool() {
  const [target, setTarget] = useState(''); const [saved, setSaved] = useState(''); const [monthly, setMonthly] = useState(''); const [months, setMonths] = useState('');
  const r = savingsGoal(num(target), num(saved) || 0, num(monthly) > 0 ? num(monthly) : null, num(months) > 0 ? num(months) : null);
  return <Card className="stack"><h3 className="h-sm">Savings goal</h3><p className="muted">Fill in a monthly amount to see how long it takes, or a number of months to see what to set aside. No interest is assumed.</p>
    <div className="grid-2"><TextField label="Target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /><TextField label="Already saved" optional inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} /><TextField label="Monthly saving" optional inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /><TextField label="Months to reach it" optional inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} /></div>
    <div aria-live="polite">{num(target) > 0 && <><p>Still to save: <strong>{money(r.remaining)}</strong></p>{r.monthsNeeded !== null && <p>At {money(num(monthly))} a month: about <strong>{r.monthsNeeded}</strong> month{r.monthsNeeded === 1 ? '' : 's'} ({(r.monthsNeeded / 12).toFixed(1)} years).</p>}{r.monthlyNeeded !== null && <p>To finish in {months} months: set aside <strong>{money(r.monthlyNeeded)}</strong> a month.</p>}{!r.reachable && <p className="muted">Add a monthly amount or a number of months.</p>}</>}</div></Card>;
}
function GrowthTool() {
  const [p, setP] = useState('1000'); const [m, setM] = useState('50'); const [rate, setRate] = useState('5'); const [y, setY] = useState('10');
  const rows = compoundGrowth(num(p) || 0, num(m) || 0, Number.isFinite(num(rate)) ? num(rate) : 0, Number.isFinite(num(y)) ? num(y) : 0);
  const last = rows[rows.length - 1];
  return <Card className="stack"><h3 className="h-sm">Growth illustration</h3><Notice tone="warn" title="An illustration, not a forecast.">Real returns vary, can be negative, and fees and inflation matter. This uses one made-up steady rate.</Notice>
    <div className="grid-2"><TextField label="Starting amount" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} /><TextField label="Added each month" inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} /><TextField label="Yearly rate (%)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /><TextField label="Years (up to 60)" inputMode="numeric" value={y} onChange={(e) => setY(e.target.value)} /></div>
    <div aria-live="polite">{last ? <><p>After {last.year} years: <strong>{money(last.balance)}</strong> (you put in {money(last.contributed)}; growth {money(last.growth)}).</p>
      <div className="table-wrap"><table className="table"><caption className="sr-only">Balance by year</caption><thead><tr><th>Year</th><th>Balance</th><th>You put in</th><th>Growth</th></tr></thead><tbody>{rows.slice(0, 40).map((r) => <tr key={r.year}><td>{r.year}</td><td>{money(r.balance)}</td><td>{money(r.contributed)}</td><td>{money(r.growth)}</td></tr>)}</tbody></table></div></> : <p className="muted">Enter at least one year.</p>}</div></Card>;
}
export function FinanceTools() {
  return <div className="stack-lg"><Notice tone="info" title="Education, not advice.">FREEVERSE doesn’t handle money, accounts or investments, and nothing here is personal financial advice. Never share bank details or passwords with anyone.</Notice><BudgetTool /><GoalTool /><GrowthTool /></div>;
}

// ───────── FreeHealth guides ─────────
const GUIDES: { id: string; title: string; points: string[] }[] = [
  { id: 'sleep', title: 'Sleep basics', points: ['A regular wake-up time helps more than a perfect bedtime.', 'Dim the lights and put screens down for a while before bed if you can.', 'If you can’t sleep, get up and do something calm until you feel tired rather than lying there frustrated.'] },
  { id: 'move', title: 'Moving a little', points: ['Short walks count. Ten minutes is a real start.', 'Pick something you’d actually do, with someone if that helps.', 'Stop and get advice if something hurts in a way that feels wrong.'] },
  { id: 'stress', title: 'Stress in the moment', points: ['Slow your breathing: in for four, out for six, a few times.', 'Name what you’re feeling in a few words. It can take the edge off.', 'Break the next hour into one small step.'] },
  { id: 'focus', title: 'Focus and breaks', points: ['Work in short blocks with real breaks, away from your phone.', 'Write down the one thing that matters most today.', 'Drink some water and look out of a window now and then.'] },
  { id: 'connect', title: 'Staying connected', points: ['One message to one person is enough.', 'Join something small and regular, like a study group or a community here.', 'It’s fine to want company and fine to want quiet; notice which you need.'] },
  { id: 'help', title: 'When to get help', points: ['If you feel unsafe, or worried about your own safety or someone else’s, contact your local emergency number right away.', 'If low mood, anxiety, sleep or eating problems last or get in the way of daily life, talk to a doctor, a counsellor or someone you trust.', 'FREEVERSE and Nova are not a clinical service and can’t diagnose or treat anything.'] },
];
export function WellbeingGuides() {
  return <div className="stack-lg"><Notice tone="warn" title="General information only.">These guides are not medical advice and have not yet had formal health-content review. If you’re worried about your health, speak to a professional. <Link to="/help">Support and crisis resources</Link></Notice>
    <div className="grid-cards">{GUIDES.map((g) => <Card key={g.id} as="article" className="stack-sm"><h3 className="h-sm">{g.title}</h3><ul>{g.points.map((p) => <li key={p}>{p}</li>)}</ul></Card>)}</div>
    <Card className="stack-sm"><h3 className="h-sm">Your private tools</h3><div className="row-wrap"><Link to="/ai/habits" className="btn btn-secondary">Habit tracker</Link><Link to="/ai/journal" className="btn btn-secondary">Journal</Link><Link to="/ai" className="btn btn-secondary">Talk to Nova</Link></div><p className="faint">Habits and journal entries are private to you.</p></Card></div>;
}

// ───────── FreeAI status ─────────
export function AiStatus() {
  const info = useResource(() => api.get<{ mode: string; provider: string; honesty: string }>('/api/ai/info'), []);
  const caps = useResource(() => api.get<{ capabilities: { id: string; label: string; state: string; detail: string }[] }>('/api/council/capabilities'), []);
  const tone = (s: string) => (s === 'operational' ? 'ok' : s === 'demo' || s === 'configured' ? 'cyan' : undefined) as 'ok' | 'cyan' | undefined;
  return <div className="stack-lg"><Async res={info}>{(d) => <Notice tone={d.mode === 'demo' ? 'demo' : 'info'} title={d.mode === 'demo' ? 'Demo mode' : 'Connected'}>{d.honesty}</Notice>}</Async>
    <Card className="stack-sm"><h3 className="h-sm">Capabilities and their real state</h3><p className="muted">“Operational” means a live check succeeded recently. “Configured” means credentials exist but nothing has been verified. “Demo” means scripted stand-ins. “Unavailable” means it doesn’t exist.</p>
      <Async res={caps}>{(d) => <ul className="plain stack-sm">{d.capabilities.map((c) => <li key={c.id} className="spread"><div><strong>{c.label}</strong><div className="faint">{c.detail}</div></div><Badge tone={tone(c.state)}>{c.state}</Badge></li>)}</ul>}</Async></Card></div>;
}

// ───────── FreeMedia: manage your own publications ─────────
export function MyPublications({ universe }: { universe: string }) {
  const res = useResource(() => api.get<FeedResponse>(`/api/feed?universe=${universe}&mine=1&sort=recent&limit=30`), [universe]);
  return <div className="stack"><p className="muted">Everything you’ve published here. Edit or delete any item from its card.</p><Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="edit" title="Nothing published yet">Publish an article or show your work from the other tabs.</EmptyState>)}>{(d) => <>{d.items.map((p) => <PostCard key={p.id} post={p} onGone={res.reload} />)}</>}</Async></div>;
}

export function renderTool(tool: string, universe: string, query: URLSearchParams): React.ReactNode {
  switch (tool) {
    case 'games': return <GamesHub initial={query.get('game') ?? undefined} />;
    case 'finance-tools': return <FinanceTools />;
    case 'wellbeing-guides': return <WellbeingGuides />;
    case 'ai-status': return <AiStatus />;
    case 'my-publications': return <MyPublications universe={universe} />;
    default: return <Notice tone="warn">This tool isn’t available.</Notice>;
  }
}
