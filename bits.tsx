import { useState } from 'react';
import { api } from '../../api/client';
import { Link, navigate } from '../../lib/router';
import { Badge, Button, Dialog, Notice, TextField, errMsg } from '../../ui/kit';
import { useToast } from '../../state/toast';
import { templateFor } from '../../../shared/universe-spaces';
import type { PostView } from '../../../shared/api/content';

export function MessageDialog({ handle, open, onClose, starter }: { handle: string; open: boolean; onClose: () => void; starter?: string }) {
  const { say } = useToast(); const [msg, setMsg] = useState(starter ?? ''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const send = async () => { setBusy(true); setErr(null); try { const r = await api.post<{ conversation: { id: string } }>('/api/conversations', { handle, body: msg }); onClose(); navigate(`/messages/${r.conversation.id}`); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  return <Dialog open={open} onClose={onClose} title={`Message @${handle}`} actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!msg.trim()} onClick={() => void send()}>Send</Button></>}>
    <p className="muted">First messages go to their requests until they accept. Don’t share passwords, ID numbers or payment details.</p>
    <TextField label="Message" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} />{err && <p className="error-text" role="alert">{err}</p>}</Dialog>;
}

/** Template label, structured fields, the "I'm in" action and the contact button. Rendered inside a PostCard for Universe posts. */
export function UniverseBits({ post, onChange }: { post: PostView; onChange: (p: PostView) => void }) {
  const { say } = useToast(); const [dm, setDm] = useState(false); const [who, setWho] = useState<{ handle: string; displayName: string | null }[] | null>(null);
  const tpl = post.universe && post.template ? templateFor(post.universe, post.template) : undefined;
  if (!tpl) return null;
  const meta = (post.data.meta ?? {}) as Record<string, string | number>;
  const rows = tpl.fields.filter((f) => meta[f.key] !== undefined && meta[f.key] !== '');
  const handle = !post.author.anonymous ? post.author.person.handle : null;
  const part = post.participation;
  const toggle = async () => {
    if (!part) return;
    try { const r = part.joined ? await api.del<{ joined: boolean; count: number }>(`/api/posts/${post.id}/participation`) : await api.put<{ joined: boolean; count: number }>(`/api/posts/${post.id}/participation`); onChange({ ...post, participation: { count: r.count, joined: r.joined } }); say(r.joined ? tpl.participation!.done : 'Removed'); } catch (e) { say(errMsg(e), 'error'); }
  };
  const showWho = async () => { try { setWho((await api.get<{ items: { handle: string; displayName: string | null }[] }>(`/api/posts/${post.id}/participants`)).items); } catch (e) { say(errMsg(e), 'error'); } };
  return <div className="stack-sm uni-bits">
    {rows.length > 0 && <dl className="meta-list">{rows.map((f) => <div key={f.key}><dt>{f.label.replace(/ \(.*\)$/, '')}</dt><dd>{String(meta[f.key])}</dd></div>)}</dl>}
    {tpl.notice && <p className="faint">{tpl.notice}</p>}
    <div className="row-wrap">
      {part && !post.viewer.mine && <Button size="sm" variant={part.joined ? 'secondary' : 'primary'} aria-pressed={part.joined} onClick={() => void toggle()}>{part.joined ? `✓ ${tpl.participation!.done}` : tpl.participation!.label}</Button>}
      {part && <Badge>{part.count} {part.count === 1 ? 'person' : 'people'} in</Badge>}
      {part && post.viewer.mine && part.count > 0 && !who && <Button size="sm" onClick={() => void showWho()}>See who</Button>}
      {handle && !post.viewer.mine && post.universe === 'freemarket' && <Button size="sm" variant="primary" onClick={() => setDm(true)}>{post.template === 'wanted' ? 'Offer to help' : 'Message the seller'}</Button>}
      {handle && !post.viewer.mine && post.universe !== 'freemarket' && tpl.participation && part?.joined && <Button size="sm" onClick={() => setDm(true)}>Message the author</Button>}
    </div>
    {part && <p className="faint">{tpl.participation!.what}</p>}
    {who && <ul className="plain">{who.length ? who.map((w) => <li key={w.handle}><Link to={`/u/${w.handle}`}>{w.displayName ?? w.handle}</Link> <span className="faint">@{w.handle}</span></li>) : <li className="muted">Nobody yet.</li>}</ul>}
    {handle && <MessageDialog handle={handle} open={dm} onClose={() => setDm(false)} starter={post.title ? `Hi, about “${post.title}”: ` : ''} />}
    {post.universe === 'freemarket' && post.template === 'listing' && <Notice tone="info">FREEVERSE doesn’t process payments or verify sellers. Agree details by message and stay careful.</Notice>}
  </div>;
}
