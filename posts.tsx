import { useEffect, useState } from 'react';
import { api, qs } from '../api/client';
import { Link } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { Badge, Button, Check, Chip, Confirm, DemoBadge, Dialog, errMsg, IconButton, Loading, Notice, SelectField, TextArea, TextField, Seg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { useSession } from '../state/session';
import { UniverseBits } from './universe/bits';
import { templateFor } from '../../shared/universe-spaces';
import { timeAgo } from '../lib/time';
import { AUDIENCE_LABEL, POST_KINDS, REACTION_KINDS, REPORT_CATEGORIES, type Audience, type PostKind, type ReactionKind } from '../../shared/constants';
import { POST_LIMITS, REACTION_LABEL, type AuthorView, type CommentsResponse, type CommentView, type CommunityView, type FeedResponse, type PostView } from '../../shared/api/content';
import type { MediaItem } from '../../shared/api/media';

export const Author = ({ a, time, extra }: { a: AuthorView; time?: string; extra?: React.ReactNode }) => {
  if (a.anonymous) return <div className="post-head"><Avatar anonymous size={40} /><div><strong>{a.alias}</strong><div className="faint">Identity hidden{time ? ` · ${time}` : ''}</div></div></div>;
  const p = a.person;
  return (
    <div className="post-head"><Avatar avatar={p.avatar} name={p.displayName} size={40} />
      <div className="stack-0">{p.handle && !p.deleted ? <Link to={`/u/${p.handle}`}>{p.displayName}</Link> : <strong>{p.displayName}</strong>}{p.isDemo && <> <DemoBadge /></>}
        <div className="faint">{p.handle ? `@${p.handle} · ` : ''}{time}{extra}</div></div></div>
  );
};

const KIND_LABEL: Record<PostKind, string> = { text: 'Post', image: 'Image', link: 'Link', video_link: 'Video link', question: 'Question', poll: 'Poll', article: 'Article', creative: 'Creative', resource: 'Resource', event: 'Event' };

export function ReportDialog({ target, onClose }: { target: { type: 'post' | 'comment' | 'user' | 'message'; id: string } | null; onClose: () => void }) {
  const { say } = useToast(); const cats = useResource(() => api.get<{ categories: { id: string; label: string }[]; note: string }>('/api/reports/categories'), []);
  const [cat, setCat] = useState(''); const [details, setDetails] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (target) { setCat(''); setDetails(''); setErr(null); } }, [target]);
  const send = async () => { if (!target) return; setBusy(true); setErr(null); try { const r = await api.post<{ message: string }>('/api/reports', { targetType: target.type, targetId: target.id, category: cat, details: details.trim() || undefined }); say(r.message); onClose(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
  return (
    <Dialog open={!!target} onClose={onClose} title="Report this" actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!cat} busy={busy} onClick={send}>Send report</Button></>}>
      {cats.data?.note && <Notice>{cats.data.note}</Notice>}
      <fieldset className="stack-sm fieldset"><legend>What’s wrong?</legend>{(cats.data?.categories ?? REPORT_CATEGORIES.map((id) => ({ id, label: id }))).map((c) => <label key={c.id} className="radio-row"><input type="radio" name="cat" checked={cat === c.id} onChange={() => setCat(c.id)} /><span>{c.label}</span></label>)}</fieldset>
      <TextArea label="Anything we should know?" optional maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      {err && <p className="error-text" role="alert">{err}</p>}
    </Dialog>
  );
}

function ReactionMenu({ current, onPick }: { current: ReactionKind | null; onPick: (k: ReactionKind | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="menu-wrap">
      <button type="button" className="btn btn-ghost btn-sm react-btn" aria-pressed={!!current} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name="thumb" size={16} /> {current ? REACTION_LABEL[current] : 'React'}</button>
      {open && <div className="menu menu-up" role="menu">{REACTION_KINDS.map((k) => <button key={k} role="menuitemradio" aria-checked={current === k} type="button" onClick={() => { setOpen(false); onPick(current === k ? null : k); }}>{REACTION_LABEL[k]}</button>)}</div>}
    </span>
  );
}

export function Poll({ post, onChange }: { post: PostView; onChange: (p: PostView) => void }) {
  const { say } = useToast(); const poll = post.poll!;
  const vote = async (i: number) => { try { await api.post(`/api/posts/${post.id}/vote`, { option: i }); const r = await api.get<{ post: PostView }>(`/api/posts/${post.id}`); onChange(r.post); } catch (e) { say(errMsg(e), 'error'); } };
  return (
    <div className="poll" role="group" aria-label="Poll options">
      {poll.options.map((o, i) => {
        const pct = poll.resultsVisible && poll.total ? Math.round(((o.votes ?? 0) / poll.total) * 100) : null;
        return <button key={i} type="button" className="poll-opt" aria-pressed={poll.votedIndex === i} disabled={poll.votedIndex !== null} onClick={() => void vote(i)}><span className="poll-fill" style={{ width: `${pct ?? 0}%` }} aria-hidden="true" /><span className="poll-label">{o.label}</span>{pct !== null && <span className="poll-pct">{pct}%</span>}</button>;
      })}
      <p className="faint">{poll.resultsVisible ? `${poll.total} vote${poll.total === 1 ? '' : 's'}` : 'Results show after you vote'}{poll.closesAt ? ` · closes ${new Date(poll.closesAt).toLocaleDateString()}` : ''}</p>
    </div>
  );
}

export function PostCard({ post: initial, detail, onGone }: { post: PostView; detail?: boolean; onGone?: () => void }) {
  const { say } = useToast(); const [post, setPost] = useState(initial); const [rep, setRep] = useState(false); const [del, setDel] = useState(false); const [edit, setEdit] = useState(false); const [etitle, setEtitle] = useState(post.title ?? ''); const [ebody, setEbody] = useState(post.body);
  useEffect(() => setPost(initial), [initial]);
  const p = post; const now = Date.now();
  const react = async (k: ReactionKind | null) => {
    const prev = p; const counts = { ...p.counts.reactions }; if (prev.viewer.reaction) counts[prev.viewer.reaction] = Math.max(0, (counts[prev.viewer.reaction] ?? 1) - 1); if (k) counts[k] = (counts[k] ?? 0) + 1;
    setPost({ ...p, viewer: { ...p.viewer, reaction: k }, counts: { ...p.counts, reactions: counts, reactionTotal: Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) } });
    try { if (k) await api.put('/api/reactions', { targetType: 'post', targetId: p.id, kind: k }); else await api.del(`/api/reactions${qs({ targetType: 'post', targetId: p.id })}`); } catch (e) { setPost(prev); say(errMsg(e), 'error'); }
  };
  const save = async () => { const was = p.viewer.saved; setPost({ ...p, viewer: { ...p.viewer, saved: !was } }); try { if (was) await api.del(`/api/saved${qs({ kind: 'post', refId: p.id })}`); else await api.put('/api/saved', { kind: 'post', refId: p.id }); say(was ? 'Removed from Saved' : 'Saved'); } catch (e) { setPost({ ...p, viewer: { ...p.viewer, saved: was } }); say(errMsg(e), 'error'); } };
  const share = async () => { const url = `${location.origin}${location.pathname}#/post/${p.id}`; try { if (navigator.share) await navigator.share({ title: p.title ?? 'FREEVERSE post', url }); else { await navigator.clipboard.writeText(url); say('Link copied. Only people who can see this post can open it.'); } } catch { /* cancelled */ } };
  const doEdit = async () => { try { const r = await api.patch<{ post: PostView }>(`/api/posts/${p.id}`, { title: etitle || null, body: ebody }); setPost(r.post); setEdit(false); say('Saved'); } catch (e) { say(errMsg(e), 'error'); } };
  const doDelete = async () => { await api.del(`/api/posts/${p.id}`); say('Post deleted'); onGone?.(); };
  const url = typeof p.data.url === 'string' ? p.data.url : null;
  const ev = p.kind === 'event' ? p.data : null;

  if (p.status !== 'published') return <article className="card post" aria-label="Unavailable post"><Author a={p.author} time={timeAgo(p.createdAt, now)} /><Notice>{p.notice ?? 'This post is no longer available.'}</Notice></article>;
  return (
    <article className="card post" aria-labelledby={`pt-${p.id}`}>
      <div className="spread"><Author a={p.author} time={timeAgo(p.createdAt, now) + (p.editedAt ? ' · edited' : '')} extra={p.community ? <> · <Link to={`/communities/${p.community.slug}`}>{p.community.name}</Link></> : p.visibility !== 'members' ? ` · ${AUDIENCE_LABEL[p.visibility]}` : ''} />
        <div className="row-wrap">{p.universe && p.template ? <Badge tone="violet">{templateFor(p.universe, p.template)?.label ?? KIND_LABEL[p.kind]}</Badge> : p.kind !== 'text' && <Badge tone="violet">{KIND_LABEL[p.kind]}</Badge>}{p.author.anonymous && <Badge>Anonymous</Badge>}</div></div>
      {(p.title || edit) && !edit && <h2 id={`pt-${p.id}`} className="post-title">{detail ? p.title : <Link to={`/post/${p.id}`}>{p.title}</Link>}</h2>}
      {edit ? <div className="stack-sm"><TextField label="Title" value={etitle} onChange={(e) => setEtitle(e.target.value)} maxLength={POST_LIMITS.titleMax} /><TextArea label="Body" value={ebody} onChange={(e) => setEbody(e.target.value)} maxLength={POST_LIMITS.bodyMax} /><div className="row-wrap"><Button variant="primary" size="sm" onClick={() => void doEdit()}>Save</Button><Button variant="ghost" size="sm" onClick={() => setEdit(false)}>Cancel</Button></div></div>
        : p.body && <p className="post-body">{detail || p.body.length < 500 ? p.body : <>{p.body.slice(0, 480)}… <Link to={`/post/${p.id}`}>Read more</Link></>}</p>}
      {url && <a className="link-card" href={url} target="_blank" rel="noopener noreferrer nofollow"><Icon name={p.kind === 'video_link' ? 'video' : 'external'} size={18} /><span>{url.replace(/^https?:\/\//, '').slice(0, 60)}</span><span className="faint"> opens in a new tab</span></a>}
      {ev && <div className="notice"><Icon name="calendar" size={18} /><div>{ev.startsAt ? new Date(String(ev.startsAt)).toLocaleString() : ''}{ev.location ? ` · ${String(ev.location)}` : ''}</div></div>}
      {p.media.length > 0 && <div className={`media-grid m${Math.min(p.media.length, 4)}`}>{p.media.map((m) => <img key={m.id} src={m.url} alt={m.altText ?? 'Image shared in this post'} loading="lazy" width={m.width ?? undefined} height={m.height ?? undefined} />)}</div>}
      {p.poll && <Poll post={p} onChange={setPost} />}
      {p.universe && p.template && <UniverseBits post={p} onChange={setPost} />}
      {p.tags.length > 0 && <div className="row-wrap">{p.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
      {p.why && p.why.length > 0 && <p className="faint"><Icon name="info" size={14} /> Why you’re seeing this: {p.why.join(' · ')}</p>}
      <div className="post-actions">
        <ReactionMenu current={p.viewer.reaction} onPick={(k) => void react(k)} />
        {p.counts.reactionTotal > 0 && <span className="faint">{p.counts.reactionTotal}</span>}
        <Link to={`/post/${p.id}`} className="btn btn-ghost btn-sm"><Icon name="message" size={16} /> {p.counts.comments}</Link>
        <Button size="sm" variant="ghost" onClick={() => void save()} aria-pressed={p.viewer.saved}><Icon name="bookmark" size={16} /> {p.viewer.saved ? 'Saved' : 'Save'}</Button>
        <Button size="sm" variant="ghost" onClick={() => void share()}><Icon name="share" size={16} /> Share</Button>
        <span className="grow" />
        {p.viewer.canEdit && !edit && <Button size="sm" variant="ghost" onClick={() => setEdit(true)}><Icon name="edit" size={16} /> Edit</Button>}
        {p.viewer.canDelete && <Button size="sm" variant="ghost" onClick={() => setDel(true)}><Icon name="trash" size={16} /> Delete</Button>}
        {!p.viewer.mine && <Button size="sm" variant="ghost" onClick={() => setRep(true)}><Icon name="flag" size={16} /> Report</Button>}
      </div>
      <ReportDialog target={rep ? { type: 'post', id: p.id } : null} onClose={() => setRep(false)} />
      <Confirm open={del} danger title="Delete this post?" confirmLabel="Delete" onConfirm={doDelete} onClose={() => setDel(false)}>This removes the post and its comments for everyone. You can’t undo it.</Confirm>
    </article>
  );
}

// ───────── composer ─────────
export function Composer({ community, communities, onPosted }: { community?: CommunityView | null; communities?: CommunityView[]; onPosted: () => void }) {
  const { say } = useToast(); const anonOn = !!useSession().config?.features.anonymousPosting; const [open, setOpen] = useState(false); const [kind, setKind] = useState<PostKind>('text'); const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [url, setUrl] = useState(''); const [opts, setOpts] = useState(['', '']); const [tags, setTags] = useState(''); const [vis, setVis] = useState<Audience | ''>(''); const [cid, setCid] = useState(community?.id ?? ''); const [anon, setAnon] = useState(false); const [when, setWhen] = useState(''); const [loc, setLoc] = useState(''); const [media, setMedia] = useState<MediaItem[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [up, setUp] = useState(false);
  const comm = community ?? communities?.find((c) => c.id === cid) ?? null;
  const reset = () => { setTitle(''); setBody(''); setUrl(''); setOpts(['', '']); setTags(''); setAnon(false); setWhen(''); setLoc(''); setMedia([]); setKind('text'); setErr(null); };
  const needTitle = ['question', 'poll', 'article', 'creative', 'resource', 'event'].includes(kind);
  const upload = async (f: File | undefined) => { if (!f) return; setUp(true); try { const r = await api.upload<{ media: MediaItem }>('/api/media?purpose=post', f); setMedia((m) => [...m, r.media].slice(0, POST_LIMITS.mediaMax)); } catch (e) { setErr(errMsg(e)); } finally { setUp(false); } };
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const b: Record<string, unknown> = { kind, body, anonymous: anon && anonOn && !!comm?.allowAnonymous, tags: tags.split(/[,\s]+/).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean).slice(0, POST_LIMITS.tagsMax) };
      if (title.trim()) b.title = title.trim(); if (cid) b.communityId = cid; if (vis && !cid) b.visibility = vis; if (url.trim()) b.url = url.trim();
      if (kind === 'poll') b.pollOptions = opts.map((o) => o.trim()).filter(Boolean);
      if (kind === 'event') { if (when) b.startsAt = new Date(when).toISOString(); if (loc) b.location = loc; }
      if (media.length) b.mediaIds = media.map((m) => m.id);
      await api.post('/api/posts', b); say('Posted'); reset(); setOpen(false); onPosted();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  if (!open) return <button type="button" className="card composer-stub" onClick={() => setOpen(true)}><Icon name="plus" size={18} /> Share something{community ? ` in ${community.name}` : ''}…</button>;
  return (
    <section className="card stack" aria-label="New post">
      <div className="spread"><h2 className="h-sm">New post</h2><IconButton icon="x" label="Close composer" onClick={() => setOpen(false)} /></div>
      <div className="row-wrap" role="group" aria-label="Post type">{POST_KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Chip>)}</div>
      {!community && communities && <SelectField label="Where to post" value={cid} onChange={(e) => { setCid(e.target.value); setAnon(false); }}><option value="">My profile (not in a community)</option>{communities.filter((c) => c.viewer.member).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>}
      {(needTitle || kind === 'creative') && <TextField label={kind === 'question' ? 'Your question' : 'Title'} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={POST_LIMITS.titleMax} />}
      {kind !== 'poll' && <TextArea label={kind === 'image' ? 'Caption' : 'What would you like to say?'} optional={kind !== 'text'} value={body} onChange={(e) => setBody(e.target.value)} maxLength={POST_LIMITS.bodyMax} rows={4} hint={`${body.length}/${POST_LIMITS.bodyMax}`} />}
      {(kind === 'link' || kind === 'video_link' || kind === 'resource') && <TextField label={kind === 'video_link' ? 'Video link (YouTube, Vimeo or similar)' : 'Link'} type="url" optional={kind === 'resource'} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
      {kind === 'poll' && <fieldset className="stack-sm fieldset"><legend>Options (2–{POST_LIMITS.pollOptionsMax})</legend>{opts.map((o, i) => <TextField key={i} label={`Option ${i + 1}`} value={o} maxLength={POST_LIMITS.pollOptionMax} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />)}{opts.length < POST_LIMITS.pollOptionsMax && <Button size="sm" onClick={() => setOpts([...opts, ''])}>Add option</Button>}</fieldset>}
      {kind === 'event' && <div className="grid-2"><TextField label="Starts" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /><TextField label="Where" optional value={loc} onChange={(e) => setLoc(e.target.value)} /></div>}
      {(kind === 'image' || kind === 'creative' || kind === 'article') && <div className="stack-sm"><label className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}><Icon name="image" size={16} /> {up ? 'Uploading…' : 'Add image'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={up || media.length >= POST_LIMITS.mediaMax} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label><div className="row-wrap">{media.map((m) => <span key={m.id} className="thumb"><img src={m.url} alt="Selected upload" width="64" height="64" /><button type="button" aria-label="Remove image" onClick={() => setMedia(media.filter((x) => x.id !== m.id))}>✕</button></span>)}</div><p className="hint">Add a description (alt text) to images in Settings → Data so everyone can follow.</p></div>}
      <TextField label="Tags" optional hint="Up to 5, separated by spaces or commas" value={tags} onChange={(e) => setTags(e.target.value)} />
      {!cid && <SelectField label="Who can see this" value={vis} onChange={(e) => setVis(e.target.value as Audience | '')}><option value="">My default</option>{(['everyone', 'members', 'connections', 'only_me'] as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</SelectField>}
      {anonOn && comm?.allowAnonymous && comm.viewer.member && <Check label="Post anonymously" checked={anon} onChange={(e) => setAnon(e.target.checked)} hint="Members see “Anonymous author”, never your name. We still record who wrote it for safety, and moderators can’t see it without a recorded reason." />}
      {err && <p className="error-text" role="alert">{err}</p>}
      <div className="row-wrap"><Button variant="primary" busy={busy} onClick={() => void submit()}>Post</Button><Button variant="ghost" onClick={() => { reset(); setOpen(false); }}>Discard</Button></div>
    </section>
  );
}

// ───────── feed list ─────────
export function FeedList({ query, header }: { query: Record<string, string | undefined>; header?: React.ReactNode }) {
  const [items, setItems] = useState<PostView[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [expl, setExpl] = useState(''); const [loading, setLoading] = useState(true); const [more, setMore] = useState(false); const [err, setErr] = useState<unknown>(null); const [tick, setTick] = useState(0);
  const key = JSON.stringify(query);
  useEffect(() => { let on = true; setLoading(true); setErr(null); api.get<FeedResponse>(`/api/feed${qs({ ...query, limit: 15 })}`).then((r) => { if (on) { setItems(r.items); setCursor(r.nextCursor); setExpl(r.explanation); setLoading(false); } }).catch((e) => { if (on) { setErr(e); setLoading(false); } }); return () => { on = false; }; /* eslint-disable-next-line */ }, [key, tick]);
  const loadMore = async () => { if (!cursor) return; setMore(true); try { const r = await api.get<FeedResponse>(`/api/feed${qs({ ...query, cursor, limit: 15 })}`); setItems((x) => [...x, ...r.items.filter((n) => !x.some((o) => o.id === n.id))]); setCursor(r.nextCursor); } catch (e) { setErr(e); } finally { setMore(false); } };
  return (
    <div className="stack">
      {header}
      {expl && <p className="faint"><Icon name="info" size={14} /> {expl}</p>}
      {loading ? <Loading rows={3} /> : err && !items.length ? <Notice tone="warn">{errMsg(err)} <Button size="sm" onClick={() => setTick((t) => t + 1)}>Try again</Button></Notice>
        : !items.length ? <div className="state"><div className="state-icon"><Icon name="inbox" /></div><h2>Nothing here yet</h2><p className="muted">{query.sort === 'following' ? 'Follow a few people or join communities and their posts will show here.' : 'Be the first to share something.'}</p></div>
        : <>{items.map((p) => <PostCard key={p.id} post={p} onGone={() => setItems((x) => x.filter((i) => i.id !== p.id))} />)}{cursor && <Button onClick={() => void loadMore()} busy={more} block>Load more</Button>}</>}
      <span className="sr-only" aria-live="polite">{items.length} posts loaded</span>
      <button type="button" className="sr-only" onClick={() => setTick((t) => t + 1)}>Refresh feed</button>
    </div>
  );
}
export function useFeedReload() { const [n, setN] = useState(0); return { n, bump: () => setN((x) => x + 1) }; }

// ───────── comments ─────────
function CommentItem({ c, canComment, community, onReply, onChanged, depth }: { c: CommentView; canComment: boolean; community: boolean; onReply: (parent: CommentView) => void; onChanged: () => void; depth: number }) {
  const { say } = useToast(); const [rep, setRep] = useState(false); const [del, setDel] = useState(false); const [edit, setEdit] = useState(false); const [txt, setTxt] = useState(c.body); const now = Date.now();
  const react = async () => { try { if (c.viewer.reaction) await api.del(`/api/reactions${qs({ targetType: 'comment', targetId: c.id })}`); else await api.put('/api/reactions', { targetType: 'comment', targetId: c.id, kind: 'like' }); onChanged(); } catch (e) { say(errMsg(e), 'error'); } };
  if (c.status !== 'published') return <div className="comment" style={{ marginLeft: depth * 18 }}><p className="faint">{c.notice ?? 'This comment is no longer available.'}</p></div>;
  return (
    <div className="comment" style={{ marginLeft: Math.min(depth, 3) * 18 }}>
      <Author a={c.author} time={timeAgo(c.createdAt, now) + (c.editedAt ? ' · edited' : '')} />
      {edit ? <div className="stack-sm"><TextArea label="Edit comment" value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={POST_LIMITS.commentMax} /><div className="row-wrap"><Button size="sm" variant="primary" onClick={async () => { try { await api.patch(`/api/comments/${c.id}`, { body: txt }); setEdit(false); onChanged(); } catch (e) { say(errMsg(e), 'error'); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button></div></div> : <p className="post-body">{c.body}</p>}
      <div className="post-actions">
        <Button size="sm" variant="ghost" aria-pressed={!!c.viewer.reaction} onClick={() => void react()}><Icon name="thumb" size={14} /> {c.counts.reactionTotal || ''} Like</Button>
        {canComment && c.depth < POST_LIMITS.maxDepth && <Button size="sm" variant="ghost" onClick={() => onReply(c)}>Reply</Button>}
        {c.viewer.canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>Edit</Button>}
        {c.viewer.canDelete && <Button size="sm" variant="ghost" onClick={() => setDel(true)}>Delete</Button>}
        {!c.viewer.mine && <Button size="sm" variant="ghost" onClick={() => setRep(true)}>Report</Button>}
      </div>
      <ReportDialog target={rep ? { type: 'comment', id: c.id } : null} onClose={() => setRep(false)} />
      <Confirm open={del} danger title="Delete this comment?" confirmLabel="Delete" onConfirm={async () => { await api.del(`/api/comments/${c.id}`); onChanged(); }} onClose={() => setDel(false)}>Replies from others stay, under a placeholder.</Confirm>
      {community && null}
    </div>
  );
}

export function Comments({ post }: { post: PostView }) {
  const res = useResource(() => api.get<CommentsResponse>(`/api/posts/${post.id}/comments`), [post.id]); const { say } = useToast(); const anonOn = !!useSession().config?.features.anonymousPosting;
  const [body, setBody] = useState(''); const [parent, setParent] = useState<CommentView | null>(null); const [anon, setAnon] = useState(false); const [busy, setBusy] = useState(false); const [allowAnon, setAllowAnon] = useState(false);
  useEffect(() => { if (post.community) api.get<{ community: CommunityView }>(`/api/communities/${post.community.slug}`).then((r) => setAllowAnon(anonOn && r.community.allowAnonymous && r.community.viewer.member)).catch(() => {}); }, [post.community, anonOn]);
  const forced = post.author.anonymous && post.viewer.mine; // authors of an anonymous post reply anonymously
  const send = async () => { setBusy(true); try { await api.post(`/api/posts/${post.id}/comments`, { body, parentId: parent?.id, anonymous: anon || forced }); setBody(''); setParent(null); res.reload(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  const tree = (res.data?.items ?? []);
  return (
    <section className="stack" aria-labelledby="cm-h">
      <h2 id="cm-h" className="h-sm">Comments {res.data ? `(${res.data.total})` : ''}</h2>
      {post.viewer.canComment ? (
        <div className="stack-sm">
          {parent && <p className="faint">Replying to a comment · <button type="button" className="linkish" onClick={() => setParent(null)}>cancel</button></p>}
          <TextArea label={parent ? 'Your reply' : 'Add a comment'} value={body} onChange={(e) => setBody(e.target.value)} maxLength={POST_LIMITS.commentMax} rows={3} />
          {(allowAnon || forced) && <Check label="Comment anonymously" checked={anon || forced} disabled={forced} onChange={(e) => setAnon(e.target.checked)} hint={forced ? 'You wrote this post anonymously, so your replies stay anonymous too.' : 'Others see an alias such as “Anonymous member 2”.'} />}
          <Button variant="primary" size="sm" busy={busy} disabled={!body.trim()} onClick={() => void send()} style={{ justifySelf: 'start' }}>Comment</Button>
        </div>
      ) : <Notice>Comments aren’t open to you on this post.</Notice>}
      {res.loading && !res.data ? <Loading rows={2} /> : tree.length === 0 ? <p className="muted">No comments yet.</p> : <div className="stack-sm">{tree.map((c) => <CommentItem key={c.id} c={c} depth={c.depth} canComment={post.viewer.canComment} community={!!post.community} onReply={setParent} onChanged={res.reload} />)}</div>}
    </section>
  );
}
export { Seg };
