import { useState } from 'react';
import { useApp } from '../app/context';
import { useAsync } from '../hooks/useAsync';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, MockBadge, MockBanner, SkeletonCards, Notice, AVATAR_COUNT, avatarColors } from '../components/ui';
import { PostCard } from '../components/PostCard';
import { INTERESTS } from '../data/mock';
import { formatDate } from '../lib/time';
import { LinkButton } from '../components/ui';

function PostsSection({ handle }: { handle: string }) {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getProfile(handle), [api, mode, handle]);
  async function react(postId: string) {
    const x = await api.toggleReaction(postId);
    r.update((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId ? { ...p, reactedByMe: x.reacted, reactionTotal: x.total } : p)) }));
  }
  if (r.state.status === 'loading') return <SkeletonCards count={2} label="Loading posts" />;
  if (r.state.status === 'error') return <Card><ErrorState title="We couldn’t load this profile" message={r.state.error.message} onRetry={r.reload} /></Card>;
  const { posts } = r.state.data;
  if (posts.length === 0) return <Card><EmptyState icon="message" title="No posts yet">Posts shared here will appear newest first.</EmptyState></Card>;
  return <ul className="stack" aria-label="Posts, newest first">{posts.map((p) => <li key={p.id}><PostCard post={p} onReact={react} /></li>)}</ul>;
}

export function MyProfile() {
  const { account, updateProfile, signOut } = useApp();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [hue, setHue] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!account) return null;

  function open() {
    setDisplayName(account!.displayName); setBio(account!.bio); setInterests(account!.interests); setHue(account!.hue); setError(null); setEditing(true);
  }
  function save() {
    const r = updateProfile({ displayName, bio, interests, hue });
    if (!r.ok) { setError(r.error); return; }
    setEditing(false); setSaved(true);
  }

  return (
    <div className="stack-lg">
      <header className="page-head"><h1 id="page-title">Your profile</h1></header>
      <div className="layout-2">
        <div className="stack">
          <Card>
            <div className="row" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <Avatar name={account.displayName} hue={account.hue} size={76} />
              <div className="stack-sm" style={{ flex: 1, minWidth: 200 }}>
                <h2 style={{ fontSize: '1.5rem' }}>{account.displayName}</h2>
                <p className="faint">@{account.handle} · Joined {formatDate(account.createdAt)}</p>
                <p>{account.bio || <span className="muted">No bio yet. Add one so people know what you’re about.</span>}</p>
                {account.interests.length > 0 && <div className="row-wrap">{account.interests.map((i) => <Badge key={i} tone="cyan">{i}</Badge>)}</div>}
                {account.goals.length > 0 && <div className="row-wrap">{account.goals.map((g) => <Badge key={g} tone="violet">{g}</Badge>)}</div>}
              </div>
              <Button variant="secondary" onClick={open}>Edit profile</Button>
            </div>
            {saved && <p role="status" className="faint" style={{ marginTop: 12 }}>Profile saved in this browser (mock, not synced anywhere).</p>}
          </Card>
          <h2>Your posts</h2>
          <PostsSection handle={account.handle} />
        </div>
        <aside className="stack" aria-label="Account">
          <Card as="section">
            <h2 style={{ marginBottom: 12 }}>Account &amp; privacy</h2>
            <dl style={{ margin: 0, display: 'grid', gap: 12 }}>
              <div><dt className="faint">Email (kept only in this browser)</dt><dd style={{ margin: 0 }}>{account.email}</dd></div>
              <div><dt className="faint">Age confirmation</dt><dd style={{ margin: 0 }}>18+ confirmed by self-declaration on {formatDate(account.age.attestedAt)}</dd></div>
            </dl>
            <div className="stack-sm" style={{ marginTop: 14 }}>
              <Notice icon="lock">Privacy controls, data export and account deletion arrive in Stage 2. They aren’t available yet.</Notice>
              <Button variant="secondary" icon="logout" onClick={signOut}>Sign out</Button>
            </div>
          </Card>
          <MockBanner>This is a simulated account stored in your browser. There is no server and no password.</MockBanner>
        </aside>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit profile" actions={<><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <Field label="Display name" error={error && error.toLowerCase().includes('name') ? error : undefined}>
          {(p) => <input {...p} className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
        </Field>
        <Field label="Bio" hint={`${280 - bio.length} characters left`} error={error && error.toLowerCase().includes('bio') ? error : undefined}>
          {(p) => <textarea {...p} className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={400} />}
        </Field>
        <div className="field">
          <span className="label" id="ed-int">Interests</span>
          <div className="row-wrap" role="group" aria-labelledby="ed-int">
            {INTERESTS.map((i) => <button key={i} type="button" className="chip" aria-pressed={interests.includes(i)} onClick={() => setInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i])}>{i}</button>)}
          </div>
        </div>
        <div className="field">
          <span className="label" id="ed-hue">Avatar colours</span>
          <div className="color-pick" role="group" aria-labelledby="ed-hue">
            {Array.from({ length: AVATAR_COUNT }).map((_, i) => {
              const [c1, c2] = avatarColors(i);
              return <button key={i} type="button" aria-label={`Colour option ${i + 1}`} aria-pressed={hue === i} onClick={() => setHue(i)} style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />;
            })}
          </div>
        </div>
        {error && !/name|bio/i.test(error) && <p className="error-text" role="alert">{error}</p>}
      </Dialog>
    </div>
  );
}

export function UserProfile({ handle }: { handle: string }) {
  const { api, mode, viewer } = useApp();
  const r = useAsync(() => api.getProfile(handle), [api, mode, handle]);
  const [followError, setFollowError] = useState<string | null>(null);

  if (r.state.status === 'loading') return <div className="stack-lg"><h1 id="page-title" className="sr-only">Profile</h1><SkeletonCards count={2} label="Loading profile" /></div>;
  if (r.state.status === 'error') {
    return (
      <div className="stack-lg">
        <h1 id="page-title" className="sr-only">Profile</h1>
        <Card><ErrorState title="We couldn’t load this profile" message={r.state.error.message} onRetry={r.reload} /></Card>
        <div><LinkButton to="/home" icon="arrowLeft">Back to Home</LinkButton></div>
      </div>
    );
  }
  const { user, following, isViewer } = r.state.data;
  async function toggle() {
    setFollowError(null);
    try {
      const now = await api.toggleFollow(user.id);
      r.update((prev) => ({ ...prev, following: now }));
    } catch (e) { setFollowError(e instanceof Error ? e.message : 'Couldn’t update.'); }
  }
  return (
    <div className="stack-lg">
      <h1 id="page-title" className="sr-only">{user.displayName}’s profile</h1>
      <Card>
        <div className="row" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <Avatar name={user.displayName} hue={user.hue} size={76} />
          <div className="stack-sm" style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: '1.5rem' }}>{user.displayName}</h2>
            <p className="faint">@{user.handle} · Joined {formatDate(user.joinedAt)}</p>
            <p>{user.bio}</p>
            {user.interests.length > 0 && <div className="row-wrap">{user.interests.map((i) => <Badge key={i} tone="cyan">{i}</Badge>)}</div>}
          </div>
          {isViewer ? <LinkButton to="/profile">Your profile</LinkButton> : viewer && (
            <div className="stack-sm" style={{ justifyItems: 'end' }}>
              <Button variant={following ? 'secondary' : 'primary'} aria-pressed={following} onClick={toggle}>{following ? 'Following' : 'Follow'}</Button>
              <MockBadge label="Saved in this browser only" />
            </div>
          )}
        </div>
        {followError && <p className="error-text" role="alert" style={{ marginTop: 10 }}>{followError}</p>}
      </Card>
      <h2>Posts</h2>
      <PostsSection handle={user.handle} />
    </div>
  );
}
