import { useState } from 'react';
import { api } from '../api/client';
import { Link } from '../lib/router';
import { Async, Badge, Button, Card, EmptyState, Notice, PageHead, TextArea, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { timeAgo } from '../lib/time';
import type { UniverseView } from '../../shared/api/catalog';

type P = { params: Record<string, string>; query: URLSearchParams };
const STATUS_TONE = (s: string) => (s === 'available' ? 'ok' : s === 'partial' ? 'cyan' : undefined) as 'ok' | 'cyan' | undefined;

function InterestButton({ k, on, onChange }: { k: string; on: boolean; onChange: () => void }) {
  const { say } = useToast();
  return <Button variant={on ? 'secondary' : 'primary'} aria-pressed={on} onClick={async () => { try { if (on) await api.del(`/api/interest/${k}`); else await api.put(`/api/interest/${k}`); say(on ? 'Removed' : 'Noted. It’s private, and it’s not a pre-order or a promise of a date.'); onChange(); } catch (e) { say(errMsg(e), 'error'); } }}>{on ? 'You’re interested ✓' : 'Tell me when this exists'}</Button>;
}

const SOON: Record<string, { title: string; text: string; today?: { label: string; to: string } }> = {
  calls: { title: 'Calls', text: 'Voice and video calls aren’t built yet. Messaging is available now.', today: { label: 'Open Messages', to: '/messages' } },
  portfolios: { title: 'Portfolios', text: 'Full portfolios aren’t built yet. You can already add projects and highlights to your profile.', today: { label: 'Edit your highlights', to: '/me/profile' } },
  marketplace: { title: 'Marketplace', text: 'Payments, escrow and seller checks aren’t built. FreeMarket has listings and requests without payments.', today: { label: 'Open FreeMarket', to: '/universes/freemarket' } },
  games: { title: 'Games', text: 'FreePlay now has single-player games you can play in the browser. Multiplayer isn’t built.', today: { label: 'Open FreePlay', to: '/universes/freeplay' } },
  watch: { title: 'Watch', text: 'Video hosting isn’t built. You can share video links in posts today.', today: { label: 'Go to the feed', to: '/home' } },
};
export function SoonPage({ params }: P) {
  const key = (params.feature ?? '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '') || 'feature'; const d = SOON[params.feature ?? ''] ?? { title: (params.feature ?? 'This feature').replace(/[-_]/g, ' '), text: 'This isn’t built yet.' };
  const mine = useResource(() => api.get<{ keys: string[] }>('/api/interest'), []);
  return <div className="stack-lg"><PageHead title={d.title} back={{ to: '/universes', label: 'Universes' }}><span>Coming later</span></PageHead><Notice tone="info" title="Not available yet">{d.text} No date has been promised.</Notice>
    <Card className="stack-sm"><Async res={mine}>{(m) => <InterestButton k={`feature:${key}`} on={m.keys.includes(`feature:${key}`)} onChange={mine.reload} />}</Async>{d.today && <Link className="btn btn-secondary" to={d.today.to} style={{ justifySelf: 'start' }}>{d.today.label}</Link>}</Card></div>;
}

// ───────── Help & safety ─────────
export function HelpPage(_: P) {
  const { say } = useToast(); const acts = useResource(() => api.get<{ items: any[] }>('/api/safety/actions'), []); const [stmt, setStmt] = useState<Record<string, string>>({}); const [open, setOpen] = useState<string | null>(null);
  const res = useResource(() => api.get<{ resources: { label: string; detail: string; url?: string }[] }>('/api/ai/info').then((r) => r as any), []);
  return <div className="stack-lg"><PageHead title="Help & safety">What to do if something’s wrong, and what we do about it.</PageHead>
    <Card className="stack-sm"><h2 className="h-sm">If you or someone is in danger</h2><p>FREEVERSE is not an emergency service. If someone is at immediate risk, contact your local emergency number.</p><Async res={res}>{(r: any) => <ul className="plain stack-sm">{(r.resources ?? []).map((x: any) => <li key={x.label}><strong>{x.label}</strong> <span className="muted">{x.detail}</span> {x.url && <a href={x.url} target="_blank" rel="noopener noreferrer">{x.url.replace(/^https?:\/\//, '')}</a>}</li>)}</ul>}</Async></Card>
    <Card className="stack-sm"><h2 className="h-sm">Report something</h2><p>Use <strong>Report</strong> on any post, comment or profile. A person reviews it. Moderators see only the reported material, need a written reason for each look, and every look is audited. Reports are confidential; the person reported isn’t told who reported.</p></Card>
    <Card className="stack-sm"><h2 className="h-sm">Anonymous posting</h2><p>In communities that allow it, others see an alias, never your name. We keep an internal record of the author for safety. Only specially authorised moderators can look it up, with a written reason, a fresh confirmation and an audit entry. It is not available through the API to anyone else.</p></Card>
    <Card className="stack-sm"><h2 className="h-sm">Block and mute</h2><p>Blocking hides you both from each other and stops messages. Manage them in <Link to="/settings/blocked">Settings</Link>.</p></Card>
    <Card className="stack-sm"><h2 className="h-sm">Actions taken on your account</h2><Async res={acts} empty={(d) => (d.items.length ? null : <p className="muted">Nothing has been done on your account.</p>)}>{(d) => <ul className="plain stack-sm">{d.items.map((a) => <li key={a.id} className="card stack-sm"><div><Badge>{a.action.replace('_', ' ')}</Badge> <span className="faint">{timeAgo(a.at, Date.now())} · {a.category.replace(/_/g, ' ')}</span></div>{a.note && <p>{a.note}</p>}
      {a.appealStatus ? <p className="faint">Appeal: {a.appealStatus}</p> : a.canAppeal && (open === a.id ? <div className="stack-sm"><TextArea label="Why do you disagree?" value={stmt[a.id] ?? ''} onChange={(e) => setStmt({ ...stmt, [a.id]: e.target.value })} maxLength={1500} hint="At least 20 characters. A different person reviews it." /><div className="row-wrap"><Button size="sm" variant="primary" disabled={(stmt[a.id] ?? '').trim().length < 20} onClick={async () => { try { await api.post('/api/appeals', { actionId: a.id, statement: stmt[a.id] }); say('Appeal sent'); setOpen(null); acts.reload(); } catch (e) { say(errMsg(e), 'error'); } }}>Send appeal</Button><Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button></div></div> : <Button size="sm" onClick={() => setOpen(a.id)}>Appeal this</Button>)}</li>)}</ul>}</Async></Card>
    <p className="faint">Read more: <Link to="/trust">How trust works</Link> · <Link to="/governance">Governance</Link> · <Link to="/settings/privacy">Privacy settings</Link></p></div>;
}
