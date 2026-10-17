import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../app/context';
import { useAsync } from '../hooks/useAsync';
import { Button, Card, EmptyState, ErrorState, LinkButton, MockBanner, PageHeader, Skeleton, SkeletonCards, Badge } from '../components/ui';
import { Icon } from '../components/Icon';
import { PostCard } from '../components/PostCard';
import { Link } from '../lib/router';
import { POST_MAX, validatePost } from '../lib/validate';
import { daysUntil, formatDateTime } from '../lib/time';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const { api, mode, account } = useApp();
  const feed = useAsync(() => api.getFeed(), [api, mode]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validatePost(draft);
    if (err) { setPostError(err); composerRef.current?.focus(); return; }
    setPosting(true); setPostError(null);
    try {
      const created = await api.createPost(draft);
      feed.update((prev) => [created, ...prev]);
      setDraft('');
    } catch (e2) {
      setPostError(e2 instanceof Error ? e2.message : 'Couldn’t post.');
    } finally { setPosting(false); }
  }

  async function react(postId: string) {
    const r = await api.toggleReaction(postId);
    feed.update((prev) => prev.map((p) => (p.id === postId ? { ...p, reactedByMe: r.reacted, reactionTotal: r.total } : p)));
  }

  const left = POST_MAX - draft.length;
  const first = account?.displayName.split(' ')[0] ?? 'there';

  return (
    <div className="stack-lg">
      <PageHeader title={`${greeting()}, ${first}`} intro="Here’s what’s happening in your community. Your feed is in time order, newest first, with no hidden ranking." />
      <MockBanner>People, posts, opportunities and events are fictional. Posts and reactions you make are saved only in this browser.</MockBanner>
      <div className="layout-2">
        <section aria-labelledby="feed-h" className="stack">
          <h2 id="feed-h" className="sr-only">Community feed</h2>
          <Card>
            <form onSubmit={submit} className="stack-sm" noValidate>
              <label htmlFor="composer" style={{ fontWeight: 650 }}>Share something with the community</label>
              <textarea
                id="composer" ref={composerRef} className="textarea" value={draft} placeholder="What are you learning, making or wondering about?"
                onChange={(e) => setDraft(e.target.value)} aria-describedby="composer-meta" {...(postError ? { 'aria-invalid': true } : {})}
              />
              <div className="spread">
                <span id="composer-meta" className={left < 0 ? 'error-text' : 'faint'}>{left} characters left</span>
                <Button type="submit" variant="primary" disabled={posting}>{posting ? 'Posting…' : 'Post'}</Button>
              </div>
              {postError && <p className="error-text" role="alert">{postError}</p>}
            </form>
          </Card>

          {feed.state.status === 'loading' && <SkeletonCards label="Loading your feed" />}
          {feed.state.status === 'error' && <Card><ErrorState title="We couldn’t load your feed" message={feed.state.error.message} onRetry={feed.reload} /></Card>}
          {feed.state.status === 'success' && feed.state.data.length === 0 && (
            <Card><EmptyState icon="users" title="Your feed is quiet" action={<Button variant="primary" onClick={() => composerRef.current?.focus()}>Write the first post</Button>}>
              When people you follow share something, it shows up here. Start the conversation yourself.
            </EmptyState></Card>
          )}
          {feed.state.status === 'success' && feed.state.data.length > 0 && (
            <ul className="stack" aria-label="Posts, newest first">
              {feed.state.data.map((p) => <li key={p.id}><PostCard post={p} onReact={react} /></li>)}
            </ul>
          )}
        </section>

        <aside className="stack" aria-label="Discover">
          <NovaCard />
          <UpcomingEvents />
          <LearnPicks />
          <ClosingSoon />
        </aside>
      </div>
    </div>
  );
}

function NovaCard() {
  return (
    <div className="hero">
      <div className="stack-sm">
        <span className="badge badge-violet"><Icon name="nova" size={14} /> Nova</span>
        <h2>Think something through</h2>
        <p className="muted">Reflect, plan a next step, or find the right resource. Nova is a supportive companion, not a therapist.</p>
        <div><LinkButton to="/nova" variant="primary" size="sm">Talk to Nova</LinkButton></div>
      </div>
    </div>
  );
}

function SideCard({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  return (
    <Card as="section">
      <div className="spread" style={{ marginBottom: 12 }}>
        <h2>{title}</h2>
        <Link to={to}>See all<span className="sr-only"> {title}</span></Link>
      </div>
      {children}
    </Card>
  );
}

function SideState<T>({ s, retry, empty, children }: { s: ReturnType<typeof useAsync<T[]>>['state']; retry: () => void; empty: string; children: (d: T[]) => React.ReactNode }) {
  if (s.status === 'loading') return <div role="status" aria-busy="true" className="stack-sm"><span className="sr-only">Loading…</span><Skeleton /><Skeleton width="70%" /></div>;
  if (s.status === 'error') return <div role="alert" className="stack-sm"><p className="muted">Couldn’t load this.</p><div><Button size="sm" icon="refresh" onClick={retry}>Try again</Button></div></div>;
  if (s.data.length === 0) return <p className="muted">{empty}</p>;
  return <>{children(s.data)}</>;
}

function UpcomingEvents() {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getEvents(), [api, mode]);
  return (
    <SideCard title="Coming up" to="/events">
      <SideState s={r.state} retry={r.reload} empty="No events scheduled yet.">
        {(events) => <ul className="stack-sm">{events.slice(0, 2).map((e) => (
          <li key={e.id}><Link to="/events" style={{ color: 'var(--text)', fontWeight: 650, textDecoration: 'none' }}>{e.title}</Link><div className="faint">{formatDateTime(e.startsAt)}</div></li>
        ))}</ul>}
      </SideState>
    </SideCard>
  );
}

function LearnPicks() {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getLearn(), [api, mode]);
  return (
    <SideCard title="Keep learning" to="/learn">
      <SideState s={r.state} retry={r.reload} empty="Nothing to learn here yet.">
        {(items) => <ul className="stack-sm">{items.slice(0, 3).map((l) => (
          <li key={l.id}><Link to={`/learn/${l.id}`} style={{ color: 'var(--text)', fontWeight: 650, textDecoration: 'none' }}>{l.title}</Link><div className="faint">{l.type === 'path' ? 'Path' : l.type === 'video' ? 'Video' : 'Article'} · {l.minutes} min</div></li>
        ))}</ul>}
      </SideState>
    </SideCard>
  );
}

function ClosingSoon() {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getOpportunities(), [api, mode]);
  return (
    <SideCard title="Closing soon" to="/opportunities">
      <SideState s={r.state} retry={r.reload} empty="No opportunities listed yet.">
        {(items) => <ul className="stack-sm">{items.slice(0, 3).map((o) => (
          <li key={o.id}><Link to="/opportunities" style={{ color: 'var(--text)', fontWeight: 650, textDecoration: 'none' }}>{o.title}</Link>
            <div className="faint"><Badge tone="pink">{daysUntil(o.deadline, Date.now())} days left</Badge></div></li>
        ))}</ul>}
      </SideState>
    </SideCard>
  );
}
