import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../api/client';
import { Link, navigate } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { Async, Badge, Button, Card, Chip, EmptyState, Notice, PageHead, TextArea, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { useSession } from '../state/session';
import { timeAgo } from '../lib/time';
import { Author, ReportDialog } from '../features/posts';
import { PersonRow } from './social';
import { SaveButton } from './grow';
import type { CollectionView, NotificationView, SavedItemView, SavedKind } from '../../shared/api/content';
import { MESSAGE_LIMITS, type ConversationView, type MessageView } from '../../shared/api/messages';

type P = { params: Record<string, string>; query: URLSearchParams };

// ───────── Messages ─────────
export function MessagesPage(_: P) {
  const res = useResource(() => api.get<{ items: ConversationView[]; requests: ConversationView[] }>('/api/conversations'), []);
  const row = (c: ConversationView) => <Link key={c.id} to={`/messages/${c.id}`} className="card convo"><Avatar avatar={c.other.avatar} name={c.other.displayName} size={44} /><div className="grow stack-0"><strong>{c.other.displayName}</strong><div className="muted ellipsis">{c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.preview}` : 'No messages yet'}</div></div>{c.unread > 0 && <Badge tone="pink">{c.unread} new</Badge>}</Link>;
  return <div className="stack-lg"><PageHead title="Messages">Start a conversation from someone’s profile. First messages go to their requests until they accept.</PageHead>
    <Async res={res} empty={(d) => (!d.items.length && !d.requests.length ? <EmptyState icon="message" title="No conversations yet">Find people in <Link to="/communities">communities</Link> or <Link to="/explore">Explore</Link>, then message them from their profile.</EmptyState> : null)}>{(d) => <>
      {d.requests.length > 0 && <section className="stack-sm" aria-label="Message requests"><h2 className="h-sm">Requests ({d.requests.length})</h2><p className="muted">They can’t see that you’ve read these until you reply.</p>{d.requests.map(row)}</section>}
      {d.items.length > 0 && <section className="stack-sm" aria-label="Conversations"><h2 className="h-sm">Conversations</h2>{d.items.map(row)}</section>}</>}</Async></div>;
}

export function ConversationPage({ params }: P) {
  const { say } = useToast(); const conv = useResource(() => api.get<{ conversation: ConversationView }>(`/api/conversations/${params.id}`), [params.id]);
  const msgs = useResource(() => api.get<{ items: MessageView[]; pendingRequest: boolean }>(`/api/conversations/${params.id}/messages`), [params.id]);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [rep, setRep] = useState(false); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.data?.items.length]);
  useEffect(() => { const t = setInterval(() => msgs.reload(), 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [params.id]);
  const send = async () => { setBusy(true); try { await api.post(`/api/conversations/${params.id}/messages`, { body: text }); setText(''); msgs.reload(); conv.reload(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  const act = async (p: 'accept' | 'decline') => { try { await api.post(`/api/conversations/${params.id}/${p}`); if (p === 'decline') navigate('/messages'); else { conv.reload(); msgs.reload(); } } catch (e) { say(errMsg(e), 'error'); } };
  return <Async res={conv}>{({ conversation: c }) => (
    <div className="stack">
      <PageHead title={c.other.displayName} back={{ to: '/messages', label: 'Messages' }} actions={<>{c.other.handle && <Link className="btn btn-ghost btn-sm" to={`/u/${c.other.handle}`}>Profile</Link>}<Button size="sm" variant="ghost" onClick={() => setRep(true)}><Icon name="flag" size={14} /> Report</Button></>} />
      {c.status === 'request' && <Notice tone="warn" title="Message request">Replying accepts it. Declining hides it.<div className="row-wrap"><Button size="sm" variant="primary" onClick={() => void act('accept')}>Accept</Button><Button size="sm" onClick={() => void act('decline')}>Decline</Button></div></Notice>}
      {c.awaitingAcceptance && <Notice>{c.other.displayName} hasn’t accepted yet. They’ll see your message as a request.</Notice>}
      <div className="thread" role="log" aria-live="polite" aria-label="Messages">
        {msgs.data?.items.map((m) => <div key={m.id} className={`bubble ${m.mine ? 'mine' : 'theirs'}`}>{m.deleted ? <em className="faint">Message deleted</em> : m.body}<div className="faint small">{timeAgo(m.at, Date.now())}{m.mine && m.seen ? ' · Seen' : ''}{m.mine && !m.deleted && <> · <button type="button" className="linkish" onClick={async () => { await api.del(`/api/messages/${m.id}`); msgs.reload(); }}>Delete</button></>}</div></div>)}
        <div ref={end} />
      </div>
      {c.canSend ? <form className="composer" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(); }}><TextArea label="Message" value={text} onChange={(e) => setText(e.target.value)} maxLength={MESSAGE_LIMITS.bodyMax} rows={2} /><Button type="submit" variant="primary" busy={busy} disabled={!text.trim()}>Send</Button></form> : <Notice>{c.cannotSendReason ?? 'You can’t send messages here.'}</Notice>}
      <ReportDialog target={rep && msgs.data?.items.length ? { type: 'user', id: c.other.id ?? '' } : null} onClose={() => setRep(false)} />
    </div>)}</Async>;
}

// ───────── Notifications ─────────
export function NotificationsPage(_: P) {
  const { refreshBadges: refreshCounts } = useSession(); const [unread, setUnread] = useState(false);
  const res = useResource(() => api.get<{ items: NotificationView[]; unreadCount: number }>(`/api/notifications${qs({ unread: unread ? '1' : undefined })}`), [unread]);
  const readAll = async () => { await api.post('/api/notifications/read', {}); res.reload(); refreshCounts(); };
  return <div className="stack-lg"><PageHead title="Notifications" actions={<><Chip on={unread} onClick={() => setUnread(!unread)}>Unread only</Chip><Button size="sm" onClick={() => void readAll()}>Mark all read</Button></>}>You choose what notifies you in <Link to="/settings/notifications">Settings</Link>.</PageHead>
    <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState icon="bell" title="You’re all caught up" />)}>{(d) => <ul className="plain stack-sm">{d.items.map((n) => <li key={n.id} className={`card notif${n.readAt ? '' : ' unread'}`}>
      <div className="spread"><div>{n.href ? <Link to={n.href} onClick={() => void api.post('/api/notifications/read', { ids: [n.id] })}>{n.text}</Link> : n.text}<div className="faint">{timeAgo(n.createdAt, Date.now())}{n.readAt ? '' : ' · New'}</div></div><Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/notifications/${n.id}`); res.reload(); }} aria-label="Dismiss notification">✕</Button></div></li>)}</ul>}</Async></div>;
}

// ───────── Saved ─────────
const KIND_LABEL: Record<SavedKind, string> = { post: 'Posts', learn: 'Learning', opportunity: 'Opportunities', event: 'Events', mentor: 'Mentors', community: 'Communities', member: 'People' };
export function SavedPage(_: P) {
  const { say } = useToast(); const [kind, setKind] = useState<SavedKind | ''>(''); const [col, setCol] = useState(''); const [name, setName] = useState('');
  const res = useResource(() => api.get<{ items: SavedItemView[]; collections: CollectionView[] }>(`/api/saved${qs({ kind: kind || undefined, collection: col || undefined })}`), [kind, col]);
  const addCol = async () => { try { await api.post('/api/collections', { name }); setName(''); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  return <div className="stack-lg"><PageHead title="Saved">Only you can see what you save. Items you can no longer see are marked.</PageHead>
    <div className="row-wrap" role="group" aria-label="Type"><Chip on={!kind} onClick={() => setKind('')}>All</Chip>{(Object.keys(KIND_LABEL) as SavedKind[]).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Chip>)}</div>
    <Async res={res}>{(d) => <>
      <div className="row-wrap" role="group" aria-label="Collections"><Chip on={!col} onClick={() => setCol('')}>All saved</Chip>{d.collections.map((c) => <Chip key={c.id} on={col === c.id} onClick={() => setCol(c.id)}>{c.name} ({c.count})</Chip>)}</div>
      <form className="row-wrap" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void addCol(); }}><label className="field"><span className="label">New collection</span><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label><Button type="submit">Create</Button></form>
      {col && <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/collections/${col}`); setCol(''); }}>Delete this collection (keeps the items)</Button>}
      {d.items.length === 0 ? <EmptyState icon="bookmark" title="Nothing saved here yet">Use Save on posts, learning, opportunities, events and mentors.</EmptyState> : <ul className="plain stack-sm">{d.items.map((i) => <li key={i.id} className="card spread"><div>{i.available && i.href ? <Link to={i.href}><strong>{i.title}</strong></Link> : <span className="muted">No longer available</span>}<div className="faint">{KIND_LABEL[i.kind]}{i.subtitle ? ` · ${i.subtitle}` : ''}</div></div>
        <div className="row-wrap">{d.collections.length > 0 && <select aria-label={`Collection for ${i.title ?? 'item'}`} className="input" value={i.collectionId ?? ''} onChange={async (e) => { await api.put('/api/saved', { kind: i.kind, refId: i.refId, collectionId: e.target.value || null }); res.reload(); }}><option value="">No collection</option>{d.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}<Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/saved${qs({ kind: i.kind, refId: i.refId })}`); res.reload(); }}>Remove</Button></div></li>)}</ul>}</>}</Async></div>;
}
export { PersonRow, SaveButton, Card, Author };
