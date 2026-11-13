// Messages: the conversation list and a single conversation. What you see is shaped by your own Messaging settings,
// and what other people can do (react, reply, see you online) is shaped by theirs, enforced on the server.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { Link, navigate } from '../lib/router';
import { Avatar } from '../ui/Avatar';
import { Async, Badge, Button, Chip, Confirm, EmptyState, Notice, PageHead, TextArea, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { timeAgo } from '../lib/time';
import { checkLink, splitLinks } from '../lib/links';
import { ReportDialog } from '../features/posts';
import { REACTIONS, type ConversationView, type MessageView, type ReactionId } from '../../shared/api/messages';
import { DEFAULT_SETTINGS, type MessagingSettings } from '../../shared/api/settings';

type P = { params: Record<string, string>; query: URLSearchParams };
const useMsgPrefs = () => { const r = useResource(() => api.get<{ settings: { messaging: MessagingSettings } }>('/api/settings'), []); return r.data?.settings.messaging ?? DEFAULT_SETTINGS.messaging; };

type Box = 'conversations' | 'requests' | 'filtered' | 'archived';
export function MessagesPage(_: P) {
  const prefs = useMsgPrefs(); const res = useResource(() => api.get<{ items: ConversationView[]; archived: ConversationView[]; requests: ConversationView[]; filtered: ConversationView[] }>('/api/conversations'), []);
  const [box, setBox] = useState<Box>('conversations'); const [unreadOnly, setUnreadOnly] = useState<boolean | null>(null);
  const only = unreadOnly ?? prefs.defaultView === 'unread';
  const row = (c: ConversationView) => <Link key={c.id} to={`/messages/${c.id}`} className="card convo"><Avatar avatar={c.other.avatar} name={c.other.displayName} size={44} /><div className="grow stack-0"><strong>{c.other.displayName}</strong><span className="muted">{c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.preview}` : 'No messages yet'}</span></div>
    <div className="stack-0 end">{c.muted && <span className="faint" aria-label="Muted">Muted</span>}{c.unread > 0 && <Badge tone="violet">{c.unread} new</Badge>}{c.lastMessage && <span className="faint">{timeAgo(c.lastMessage.at, Date.now())}</span>}</div></Link>;
  const order = (xs: ConversationView[]) => (prefs.organisation === 'unread_first' ? [...xs].sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0)) : xs);
  return <div className="stack-lg"><PageHead title="Messages" actions={<Link to="/settings/messaging" className="btn btn-ghost btn-sm">Messaging settings</Link>}>Start a conversation from someone’s profile. First messages go to their requests until they accept.</PageHead>
    <Async res={res} empty={(d) => (!d.items.length && !d.requests.length && !d.filtered.length && !d.archived.length ? <EmptyState icon="message" title="No conversations yet">Find people in <Link to="/communities">communities</Link> or <Link to="/explore">Explore</Link>, then message them from their profile.</EmptyState> : null)}>{(d) => {
      const tabs: [Box, string, number][] = [['conversations', 'Conversations', d.items.length], ['requests', 'Requests', d.requests.length], ['filtered', 'Filtered', d.filtered.length], ['archived', 'Archived', d.archived.length]];
      const list = box === 'conversations' ? d.items : box === 'requests' ? d.requests : box === 'filtered' ? d.filtered : d.archived; const shown = order(only && box === 'conversations' ? list.filter((c) => c.unread > 0) : list);
      return <>
        <div className="row-wrap" role="group" aria-label="Which messages">{tabs.map(([id, label, n]) => <Chip key={id} on={box === id} onClick={() => setBox(id)}>{label}{n ? ` (${n})` : ''}</Chip>)}{box === 'conversations' && <Chip on={only} onClick={() => setUnreadOnly(!only)}>Unread only</Chip>}</div>
        {box === 'requests' && <p className="muted">People you don’t follow. They can’t see that you’ve read these until you accept.</p>}
        {box === 'filtered' && <p className="muted">Requests your Messaging settings sorted out because you share no community with the sender. You weren’t notified. Open one to accept or decline it.</p>}
        {box === 'archived' && <p className="muted">Out of your way, not deleted. {prefs.archiveBehaviour === 'return' ? 'A new message brings a conversation back.' : 'They stay here even when new messages arrive.'}</p>}
        {shown.length ? <section className="stack-sm" aria-label={tabs.find((t) => t[0] === box)![1]}>{shown.map(row)}</section> : <p className="muted">{only && box === 'conversations' ? 'Nothing unread.' : 'Nothing here.'}</p>}</>; }}</Async></div>;
}

function Body({ text, warn, ask }: { text: string; warn: boolean; ask: (u: string) => void }) {
  return <>{splitLinks(text).map((p, i) => p.url ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => { if (warn) { e.preventDefault(); ask(p.url!); } }}>{p.text}</a> : <span key={i}>{p.text}</span>)}</>;
}

export function ConversationPage({ params }: P) {
  const { say } = useToast(); const mp = useMsgPrefs(); const conv = useResource(() => api.get<{ conversation: ConversationView }>(`/api/conversations/${params.id}`), [params.id]);
  const msgs = useResource(() => api.get<{ items: MessageView[]; pendingRequest: boolean }>(`/api/conversations/${params.id}/messages`), [params.id]);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [rep, setRep] = useState(false); const [replyTo, setReplyTo] = useState<MessageView | null>(null); const [pick, setPick] = useState<string | null>(null); const [link, setLink] = useState<string | null>(null); const [del, setDel] = useState<MessageView | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.data?.items.length]);
  useEffect(() => { const t = setInterval(() => { msgs.reload(); conv.reload(); }, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [params.id]);
  const after = () => { msgs.reload(); conv.reload(); };
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) say(ok); after(); } catch (e) { say(errMsg(e), 'error'); } };
  const send = async () => { setBusy(true); try { await api.post(`/api/conversations/${params.id}/messages`, { body: text, ...(replyTo ? { replyTo: replyTo.id } : {}) }); setText(''); setReplyTo(null); after(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  const act = async (p: 'accept' | 'decline') => { try { await api.post(`/api/conversations/${params.id}/${p}`); if (p === 'decline') navigate('/messages'); else after(); } catch (e) { say(errMsg(e), 'error'); } };
  const chk = useMemo(() => (link ? checkLink(link) : null), [link]);
  return <Async res={conv}>{({ conversation: c }) => (
    <div className="stack">
      <PageHead title={c.other.displayName} back={{ to: '/messages', label: 'Messages' }} actions={<>{c.other.handle && <Link className="btn btn-ghost btn-sm" to={`/u/${c.other.handle}`}>Profile</Link>}
        <Button size="sm" variant="ghost" onClick={() => void run(() => api.post(`/api/conversations/${c.id}/mute`, { muted: !c.muted }), c.muted ? 'Notifications on for this conversation.' : 'Muted. You won’t be notified about this conversation.')}>{c.muted ? 'Unmute' : 'Mute'}</Button>
        <Button size="sm" variant="ghost" onClick={() => void run(() => api.post(`/api/conversations/${c.id}/archive`, { archived: !c.archived }), c.archived ? 'Moved back to your inbox.' : 'Archived.')}>{c.archived ? 'Unarchive' : 'Archive'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setRep(true)}>Report</Button></>}>
        {c.presence?.online ? <span className="presence on">● Online</span> : c.presence?.lastActive ? <span className="faint">{c.presence.lastActive}</span> : null}</PageHead>
      {c.status === 'request' && <Notice tone="warn" title="Message request">Replying accepts it. Declining hides it.<div className="row-wrap"><Button size="sm" variant="primary" onClick={() => void act('accept')}>Accept</Button><Button size="sm" onClick={() => void act('decline')}>Decline</Button>{c.filtered && <Button size="sm" variant="ghost" onClick={() => void run(() => api.post(`/api/conversations/${c.id}/unfilter`), 'Moved to Requests.')}>Move to Requests</Button>}</div></Notice>}
      {c.awaitingAcceptance && <Notice>{c.other.displayName} hasn’t accepted yet. They’ll see your message as a request.</Notice>}
      <div className="thread" data-density={mp.density} data-chat-theme={mp.chatTheme} data-bubble={mp.bubbleStyle} data-chat-bg={mp.chatBackground} data-chat-size={mp.chatTextSize} role="log" aria-live="polite" aria-label="Messages">
        {msgs.data?.items.map((m) => <div key={m.id} className={`bubble ${m.mine ? 'mine' : 'theirs'}`}>
          {m.replyTo && <div className="quote" aria-label="In reply to">{m.replyTo.mine ? 'You' : c.other.displayName}: {m.replyTo.preview}</div>}
          {m.deleted ? <em className="faint">Message deleted</em> : <Body text={m.body} warn={mp.linkWarnings} ask={setLink} />}
          {!!m.reactions?.length && <div className="reacts">{m.reactions.map((r) => <button key={r.emoji} type="button" className={`react${r.mine ? ' mine' : ''}`} aria-pressed={r.mine} aria-label={`${REACTIONS.find((x) => x.id === r.emoji)?.label}, ${r.count}`} onClick={() => void run(() => api.put(`/api/messages/${m.id}/reaction`, { emoji: r.mine ? null : r.emoji }))}>{REACTIONS.find((x) => x.id === r.emoji)?.glyph} {r.count}</button>)}</div>}
          <div className="faint small">{timeAgo(m.at, Date.now())}{m.mine && m.seen ? ' · Seen' : ''}{m.expiresAt ? ` · disappears ${timeAgo(m.expiresAt, Date.now()).replace(' ago', '')}` : ''}</div>
          {!m.deleted && c.canSend !== undefined && <div className="row-wrap bubble-tools">
            <Button size="sm" variant="ghost" onClick={() => setReplyTo(m)} aria-label={`Reply to ${m.mine ? 'your' : 'their'} message`}>Reply</Button>
            <Button size="sm" variant="ghost" aria-expanded={pick === m.id} onClick={() => setPick(pick === m.id ? null : m.id)}>React</Button>
            {m.mine && m.canDelete && <Button size="sm" variant="ghost" onClick={() => setDel(m)}>Delete</Button>}
            {pick === m.id && <span role="group" aria-label="Choose a reaction">{REACTIONS.map((r) => <button key={r.id} type="button" className="react" aria-label={r.label} onClick={() => { setPick(null); void run(() => api.put(`/api/messages/${m.id}/reaction`, { emoji: r.id })); }}>{r.glyph}</button>)}</span>}</div>}
        </div>)}
        <div ref={end} />
      </div>
      {c.canSend ? <form className="composer" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(); }}>
        {replyTo && <div className="quote composer-quote">Replying to: {replyTo.body.slice(0, 80)} <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button></div>}
        <TextArea label="Message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (mp.enterToSend && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) void send(); } }} rows={2} maxLength={2000} />
        <div className="row-wrap"><Button type="submit" variant="primary" busy={busy} disabled={!text.trim()}>Send</Button>{mp.defaultExpiry !== 'never' && <span className="faint">Your messages disappear after {mp.defaultExpiry === '24h' ? '24 hours' : mp.defaultExpiry === '7d' ? '7 days' : '30 days'}. Anyone who already read or copied one keeps what they saw.</span>}</div></form>
        : <Notice>{c.cannotSendReason ?? 'You can’t send messages here.'}</Notice>}
      <ReportDialog target={rep && msgs.data?.items.length ? { type: 'user', id: c.other.id ?? '' } : null} onClose={() => setRep(false)} />
      <Confirm open={!!del} title="Delete this message?" confirmLabel="Delete for both of us" danger onClose={() => setDel(null)} onConfirm={async () => { if (del) await run(() => api.del(`/api/messages/${del.id}`), 'Deleted.'); setDel(null); }}>It disappears from this conversation for both of you. It can’t remove a copy someone already took, such as a screenshot or the text of a notification.</Confirm>
      <Confirm open={!!link} title={chk?.warnings.length ? 'This link looks unusual' : 'Open this link?'} confirmLabel="Open anyway" onClose={() => setLink(null)} onConfirm={async () => { if (link) window.open(link, '_blank', 'noopener,noreferrer'); setLink(null); }}>
        <p>You’re leaving FREEVERSE for <strong>{chk?.host ?? link}</strong>.</p>{chk?.warnings.length ? <ul>{chk.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="muted">Nothing unusual stands out, but we can’t check where it leads. Only continue if you trust the sender.</p>}</Confirm>
    </div>)}</Async>;
}
export type { ReactionId };
