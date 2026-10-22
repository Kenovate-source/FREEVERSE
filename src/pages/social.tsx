import { useState } from 'react';
import { api, qs } from '../api/client';
import { Link, navigate, setQuery } from '../lib/router';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { Async, Badge, Button, Card, Chip, DemoBadge, EmptyState, Notice, PageHead, Seg, TextField, errMsg, useResource } from '../ui/kit';
import { useToast } from '../state/toast';
import { useSession } from '../state/session';
import { Composer, FeedList, PostCard, Comments, ReportDialog, useFeedReload } from '../features/posts';
import type { CommunityView, PostView } from '../../shared/api/content';
import type { MemberListItem, PersonCard, RelationFlags } from '../../shared/api/social';
import type { MemberProfile } from '../../shared/api/profile';
import type { HomeView, WidgetData } from '../../shared/api/identity';
import type { SearchResponse } from '../../shared/api/catalog';

type P = { params: Record<string, string>; query: URLSearchParams };

export const PersonRow = ({ p, note, children }: { p: PersonCard; note?: string; children?: React.ReactNode }) => (
  <div className="person-row"><Avatar avatar={p.avatar} name={p.displayName} size={44} />
    <div className="grow stack-0">{p.handle ? <Link to={`/u/${p.handle}`}><strong>{p.displayName}</strong></Link> : <strong>{p.displayName}</strong>}{p.isDemo && <> <DemoBadge /></>}<div className="faint">{p.headline ?? (p.handle ? `@${p.handle}` : '')}</div>{note && <div className="faint">{note}</div>}</div>{children}</div>
);

export function FollowButton({ handle, rel, onChange }: { handle: string; rel: RelationFlags; onChange?: (r: Partial<RelationFlags>) => void }) {
  const { say } = useToast(); const [on, setOn] = useState(rel.following); const [busy, setBusy] = useState(false);
  const t = async () => { setBusy(true); try { if (on) await api.del(`/api/members/${handle}/follow`); else await api.post(`/api/members/${handle}/follow`); setOn(!on); onChange?.({ following: !on }); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <Button size="sm" variant={on ? 'secondary' : 'primary'} busy={busy} aria-pressed={on} onClick={() => void t()}>{on ? 'Following' : 'Follow'}</Button>;
}

export const Widget = ({ w }: { w: WidgetData }) => (
  <Card className={w.wide ? 'widget wide' : 'widget'} aria-label={w.title}>
    <div className="spread"><h2 className="h-sm">{w.title}</h2>{w.planned && <Badge>Planned</Badge>}</div>
    {w.items.length === 0 ? <p className="muted">{w.empty}</p> : <ul className="plain stack-sm">{w.items.map((i, k) => <li key={k}>{i.href ? <Link to={i.href}>{i.title}</Link> : i.title}{i.subtitle && <div className="faint">{i.subtitle}</div>}{typeof i.progress === 'number' && <div className="progress" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${i.title} progress`}><span style={{ width: `${i.progress}%` }} /></div>}</li>)}</ul>}
    {w.href && <Link to={w.href} className="btn btn-ghost btn-sm">Open</Link>}
    <p className="faint small">{w.source}</p>
  </Card>
);

// ───────── Home ─────────
export function HomePage(_: P) {
  const home = useResource(() => api.get<HomeView>('/api/home'), []); const comms = useResource(() => api.get<{ items: CommunityView[] }>('/api/communities?joined=1'), []);
  const [sort, setSort] = useState<'recent' | 'relevant' | 'following'>('recent'); const { n, bump } = useFeedReload();
  return (
    <div className="stack-lg">
      <Async res={home}>{(h) => (<>
        <PageHead title={h.greeting}>{h.mode === 'identity' ? 'Your home adapts to the identities you’ve chosen. Change them any time.' : 'Pick an identity to get a home shaped around what you do.'}</PageHead>
        {h.identities.length > 0 && <div className="row-wrap" aria-label="Your identities">{h.identities.map((i) => <Link key={i.id} to={`/spaces/${i.archetype}`} className="chip chip-link"><Icon name={i.icon} size={14} /> {i.label}</Link>)}</div>}
        {h.nextSteps.length > 0 && <Card><h2 className="h-sm">Next steps</h2><ul className="plain stack-sm">{h.nextSteps.map((s) => <li key={s.id}><Link to={s.href}><strong>{s.title}</strong></Link><div className="muted">{s.description}</div></li>)}</ul></Card>}
        {h.widgets.length > 0 && <div className="grid-cards">{h.widgets.map((w) => <Widget key={w.id} w={w} />)}</div>}
      </>)}</Async>
      <section className="stack" aria-labelledby="feed-h"><div className="spread"><h2 id="feed-h">Feed</h2><Seg label="Feed order" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recent' }, { value: 'relevant', label: 'Relevant' }, { value: 'following', label: 'Following' }]} /></div>
        <Composer communities={comms.data?.items} onPosted={bump} />
        <FeedList key={n} query={{ sort }} />
      </section>
    </div>
  );
}

// ───────── Communities ─────────
export function CommunitiesPage({ query }: P) {
  const q = query.get('q') ?? ''; const cat = query.get('category') ?? ''; const joined = query.get('joined') === '1'; const [text, setText] = useState(q);
  const res = useResource(() => api.get<{ items: CommunityView[]; categories: string[] }>(`/api/communities${qs({ q: q || undefined, category: cat || undefined, joined: joined ? '1' : undefined })}`), [q, cat, joined]);
  return (
    <div className="stack-lg"><PageHead title="Communities">Spaces around shared interests. Each shows its rules and whether anonymous posting is allowed before you join.</PageHead>
      <form className="row-wrap" role="search" onSubmit={(e) => { e.preventDefault(); setQuery({ q: text || null }); }}><TextField label="Search communities" value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit">Search</Button></form>
      <div className="row-wrap" role="group" aria-label="Filters"><Chip on={!cat && !joined} onClick={() => setQuery({ category: null, joined: null })}>All</Chip><Chip on={joined} onClick={() => setQuery({ joined: joined ? null : '1' })}>Joined</Chip>{res.data?.categories.map((c) => <Chip key={c} on={cat === c} onClick={() => setQuery({ category: cat === c ? null : c })}>{c}</Chip>)}</div>
      <Async res={res} empty={(d) => (d.items.length ? null : <EmptyState title="No communities match" icon="users">Try a different search or clear the filters.</EmptyState>)}>{(d) => <div className="grid-cards">{d.items.map((c) => <CommunityCard key={c.id} c={c} />)}</div>}</Async>
    </div>
  );
}
function CommunityCard({ c }: { c: CommunityView }) {
  return <Card as="article" className="community"><div className="spread"><h2 className="h-sm"><Link to={`/communities/${c.slug}`}>{c.name}</Link></h2>{c.isDemo && <DemoBadge label="Demo community" />}</div><p className="muted">{c.description}</p><div className="row-wrap"><Badge>{c.category}</Badge>{c.allowAnonymous && <Badge tone="violet">Anonymous posting allowed</Badge>}{c.viewer.member && <Badge tone="ok">Joined</Badge>}</div><p className="faint">{c.memberCount} members · {c.postCount} posts</p></Card>;
}

export function CommunityPage({ params }: P) {
  const { say } = useToast(); const res = useResource(() => api.get<{ community: CommunityView }>(`/api/communities/${params.slug}`), [params.slug]); const { n, bump } = useFeedReload(); const [busy, setBusy] = useState(false);
  const toggle = async (c: CommunityView) => { setBusy(true); try { if (c.viewer.member) await api.del(`/api/communities/${c.slug}/join`); else await api.post(`/api/communities/${c.slug}/join`); res.reload(); } catch (e) { say(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <Async res={res}>{({ community: c }) => (
    <div className="stack-lg"><PageHead title={c.name} back={{ to: '/communities', label: 'Communities' }} actions={<Button variant={c.viewer.member ? 'secondary' : 'primary'} busy={busy} onClick={() => void toggle(c)}>{c.viewer.member ? 'Leave' : 'Join'}</Button>}>{c.description}</PageHead>
      {c.isDemo && <Notice tone="demo">This is a demo community seeded for Stage 2. Posts by demo members are labelled.</Notice>}
      <div className="grid-2"><Card><h2 className="h-sm">Community rules</h2><ol className="stack-sm">{c.rules.map((r, i) => <li key={i}>{r}</li>)}</ol></Card>
        <Card><h2 className="h-sm">Anonymous posting</h2><p className="muted">{c.allowAnonymous ? 'Allowed here. Members see “Anonymous author”, never your name. We keep an internal record for safety; moderators can only look it up with a recorded reason and extra confirmation.' : 'Not allowed in this community. Posts show your name.'}</p>
          {c.viewer.member && <Check2 c={c} onDone={res.reload} />}</Card></div>
      {c.viewer.member && <Composer community={c} onPosted={bump} />}
      <FeedList key={n} query={{ community: c.slug }} />
    </div>)}</Async>;
}
function Check2({ c, onDone }: { c: CommunityView; onDone: () => void }) {
  const { say } = useToast(); const set = async (v: boolean) => { try { await api.patch(`/api/communities/${c.slug}/membership`, { showOnProfile: v }); onDone(); } catch (e) { say(errMsg(e), 'error'); } };
  return <label className="radio-row"><input type="checkbox" checked={c.viewer.showOnProfile} onChange={(e) => void set(e.target.checked)} /><span>Show this community on my profile</span></label>;
}

// ───────── Post ─────────
export function PostPage({ params }: P) {
  const res = useResource(() => api.get<{ post: PostView }>(`/api/posts/${params.id}`), [params.id]);
  return <Async res={res}>{({ post }) => <div className="stack-lg"><PageHead title="Post" back={{ to: post.community ? `/communities/${post.community.slug}` : '/home', label: post.community ? post.community.name : 'Home' }} /><PostCard post={post} detail onGone={() => navigate('/home')} /><Comments post={post} /></div>}</Async>;
}

// ───────── Member ─────────
export function MemberPage({ params }: P) {
  const { say } = useToast(); const { me } = useSession(); const res = useResource(() => api.get<{ profile: MemberProfile }>(`/api/members/${params.handle}`), [params.handle]); const [rep, setRep] = useState(false); const [dm, setDm] = useState(false); const [msg, setMsg] = useState('');
  const mutate = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); say(ok); res.reload(); } catch (e) { say(errMsg(e), 'error'); } };
  const living = useResource(() => api.get<{ entries: { id: string; kind: string; title: string; description: string | null; evidence: string; link: string | null }[]; identities: { archetype: string; label: string; headline: string | null }[] }>(`/api/members/${params.handle}/living`).catch(() => ({ entries: [], identities: [] })), [params.handle]);
  const posts = useResource(() => api.get<{ items: PostView[] }>(`/api/members/${params.handle}/posts`).catch(() => ({ items: [] as PostView[] })), [params.handle]);
  return <Async res={res}>{({ profile: p }) => {
    const self = p.person.isSelf; const h = p.person.handle ?? params.handle ?? '';
    return (
      <div className="stack-lg">
        <div className="profile-cover" style={p.cover?.imageUrl ? { backgroundImage: `url(${p.cover.imageUrl})` } : undefined} data-preset={p.cover?.presetId ?? undefined} aria-hidden="true" />
        <div className="spread profile-head"><div className="row"><Avatar avatar={p.person.avatar} name={p.person.displayName} size={88} /><div><h1 id="page-title" tabIndex={-1}>{p.person.displayName}</h1><p className="muted">@{h}{p.pronouns ? ` · ${p.pronouns}` : ''}{p.online ? ' · Online' : ''}</p>{p.person.isDemo && <DemoBadge label="Demo member" />}</div></div>
          <div className="row-wrap">{self ? <Link to="/me/profile" className="btn btn-primary">Edit profile</Link> : <>
            <FollowButton handle={h} rel={p.relation} />
            {!p.restricted && <Button onClick={() => setDm(true)}>Message</Button>}
            <Button variant="ghost" onClick={() => setRep(true)}><Icon name="flag" size={16} /> Report</Button>
            <Button variant="ghost" onClick={() => void mutate(() => (p.relation.muted ? api.del(`/api/mutes/${h}`) : api.post(`/api/mutes/${h}`)), p.relation.muted ? 'Unmuted' : 'Muted')}>{p.relation.muted ? 'Unmute' : 'Mute'}</Button>
            <Button variant="ghost" onClick={() => void mutate(async () => { await api.post(`/api/blocks/${h}`); navigate('/home'); }, 'Blocked. They can’t see your profile or contact you.')}>Block</Button></>}</div></div>
        {p.restricted ? <Notice>This profile isn’t open to you. Its owner controls who can see it.</Notice> : <>
          {p.bio && <p className="prose">{p.bio}</p>}
          <div className="row-wrap">{p.ageBand && <Badge>Age {p.ageBand}</Badge>}{p.counts && <><Badge>{p.counts.followers} followers</Badge><Badge>{p.counts.following} following</Badge><Badge>{p.counts.connections} connections</Badge></>}</div>
          {p.interests && p.interests.length > 0 && <Card><h2 className="h-sm">Interests</h2><div className="row-wrap">{p.interests.map((i) => <span key={i.key} className="chip chip-static">{i.label}</span>)}</div></Card>}
          {living.data && (living.data.identities.length > 0 || living.data.entries.length > 0) && <Card><h2 className="h-sm">Identities & highlights</h2>
            <div className="row-wrap">{living.data.identities.map((i) => <Badge key={i.archetype} tone="cyan">{i.label}</Badge>)}</div>
            <ul className="plain stack-sm">{living.data.entries.map((e) => <li key={e.id}><strong>{e.title}</strong> <Badge tone={e.evidence === 'self_declared' ? undefined : 'ok'}>{e.evidence === 'self_declared' ? 'Self-declared' : 'Recorded on FREEVERSE'}</Badge>{e.description && <div className="muted">{e.description}</div>}</li>)}</ul></Card>}
          <section className="stack" aria-labelledby="mp"><h2 id="mp">Posts</h2>{posts.data?.items.length ? posts.data.items.map((x) => <PostCard key={x.id} post={x} />) : <p className="muted">No posts you can see yet.</p>}</section></>}
        <ReportDialog target={rep ? { type: 'user', id: p.person.id ?? '' } : null} onClose={() => setRep(false)} />
        {dm && <div className="dialog-wrap"><Card className="stack"><h2 className="h-sm">Message @{h}</h2><p className="muted">First messages go to their requests until they accept.</p><TextField label="Message" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={2000} /><div className="row-wrap"><Button variant="primary" disabled={!msg.trim()} onClick={() => void (async () => { try { const r = await api.post<{ conversation: { id: string } }>('/api/conversations', { handle: h, body: msg }); navigate(`/messages/${r.conversation.id}`); } catch (e) { say(errMsg(e), 'error'); } })()}>Send</Button><Button variant="ghost" onClick={() => setDm(false)}>Cancel</Button></div></Card></div>}
        {me && null}
      </div>);
  }}</Async>;
}

// ───────── Explore ─────────
export function ExplorePage(_: P) {
  const res = useResource(() => api.get<any>("/api/explore"), []);
  return <div className="stack-lg"><PageHead title="Explore">Each card says why it’s here. Nothing is ranked by a hidden engagement score.</PageHead>
    <Async res={res}>{(d) => (<>
      {!d.hasInterests && <Notice>Add interests in <Link to="/me/profile">your profile</Link> or <Link to="/settings/personalization">Settings</Link> to make these suggestions fit you better.</Notice>}
      <Section title="Communities" more="/communities">{d.communities.map((x: any) => <Card key={x.community.id} as="article"><h3 className="h-sm"><Link to={`/communities/${x.community.slug}`}>{x.community.name}</Link></h3><p className="muted">{x.community.description}</p><p className="faint">{x.why}</p></Card>)}</Section>
      <Section title="People to meet">{d.people.map((x: any) => <Card key={x.person.person.id ?? x.person.person.displayName}><PersonRow p={x.person.person} note={x.why}>{x.person.person.handle && <FollowButton handle={x.person.person.handle} rel={x.person.relation} />}</PersonRow></Card>)}</Section>
      <Section title="Learn" more="/learn">{d.learn.map((x: any) => <Card key={x.id} as="article"><h3 className="h-sm"><Link to={`/learn/${x.slug}`}>{x.title}</Link></h3><div className="row-wrap"><Badge>{x.format}</Badge>{x.isDemo && <DemoBadge />}</div><p className="faint">{x.why}</p></Card>)}</Section>
      <Section title="Opportunities" more="/opportunities">{d.opportunities.map((x: any) => <Card key={x.id} as="article"><h3 className="h-sm"><Link to={`/opportunities/${x.id}`}>{x.title}</Link></h3><p className="muted">{x.organisation}</p>{x.isDemo && <DemoBadge />}</Card>)}</Section>
      <Section title="Events" more="/events">{d.events.map((x: any) => <Card key={x.id} as="article"><h3 className="h-sm"><Link to={`/events/${x.id}`}>{x.title}</Link></h3><p className="muted">{new Date(x.startsAt ?? x.starts_at).toLocaleString()}</p>{x.isDemo && <DemoBadge />}</Card>)}</Section>
      <Section title="Universes" more="/universes">{d.universes.map((x: any) => <Card key={x.id} as="article"><h3 className="h-sm"><Link to={`/universes/${x.id}`}>{x.name}</Link></h3><p className="muted">{x.tagline}</p></Card>)}</Section>
      <p className="faint">{d.note}</p></>)}</Async></div>;
}
function Section({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children]; if (!arr.length || (arr.length === 1 && Array.isArray(arr[0]) && !(arr[0] as unknown[]).length)) return null;
  return <section className="stack" aria-label={title}><div className="spread"><h2>{title}</h2>{more && <Link to={more}>See all</Link>}</div><div className="grid-cards">{children}</div></section>;
}

// ───────── Search ─────────
export function SearchPage({ query }: P) {
  const q = query.get('q') ?? ''; const [text, setText] = useState(q);
  const res = useResource(() => (q.length >= 2 ? api.get<SearchResponse>(`/api/search${qs({ q })}`) : Promise.resolve(null as unknown as SearchResponse)), [q]);
  return <div className="stack-lg"><PageHead title="Search">Members, communities, posts, learning, opportunities, events, mentors and pages. You only see results you’re allowed to see.</PageHead>
    <form role="search" className="row-wrap" onSubmit={(e) => { e.preventDefault(); setQuery({ q: text }); }}><TextField label="Search FREEVERSE" value={text} onChange={(e) => setText(e.target.value)} /><Button type="submit" variant="primary">Search</Button></form>
    {q.length < 2 ? <p className="muted">Type at least two characters.</p> : <Async res={res} empty={(d) => (d && d.total === 0 ? <EmptyState title={`No results for “${q}”`} icon="search">Check the spelling or try a broader word.</EmptyState> : null)}>{(d) => <>{d.groups.map((g) => <section key={g.kind} className="stack-sm" aria-label={g.label}><h2 className="h-sm">{g.label}</h2><ul className="plain stack-sm">{g.items.map((i) => <li key={i.kind + i.id}><Link to={i.href}><strong>{i.title}</strong></Link> {i.isDemo && <DemoBadge />}{i.subtitle && <div className="muted">{i.subtitle}</div>}</li>)}</ul></section>)}</>}</Async>}</div>;
}
export type { MemberListItem };
