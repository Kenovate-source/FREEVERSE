import { useState } from 'react';
import type { FeedPost } from '../types';
import { Avatar, Button, Card, Dialog } from './ui';
import { Icon } from './Icon';
import { Link } from '../lib/router';
import { timeAgo } from '../lib/time';

function renderBody(text: string) {
  return text.split(/(#[A-Za-z0-9_]+)/g).map((part, i) =>
    part.startsWith('#') ? <span key={i} className="tag">{part}</span> : <span key={i}>{part}</span>,
  );
}

export function PostCard({ post, onReact }: { post: FeedPost; onReact: (postId: string) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  async function react() {
    setPending(true);
    setError(null);
    try { await onReact(post.id); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save your reaction.'); }
    finally { setPending(false); }
  }

  return (
    <Card as="article" className="post" aria-label={`Post by ${post.author.displayName}`}>
      <div className="post-head">
        <Avatar name={post.author.displayName} hue={post.author.hue} />
        <div style={{ minWidth: 0 }}>
          <Link to={`/u/${post.author.handle}`}>{post.author.displayName}</Link>
          <div className="faint">@{post.author.handle} · <time dateTime={post.createdAt}>{timeAgo(post.createdAt, Date.now())}</time></div>
        </div>
      </div>
      <p className="post-body">{renderBody(post.body)}</p>
      <div className="post-actions">
        <Button variant="ghost" size="sm" className="react-btn" aria-pressed={post.reactedByMe} disabled={pending} onClick={react} icon="heart">
          <span className="sr-only">{post.reactedByMe ? 'Remove reaction.' : 'React.'} Reactions:</span>{post.reactionTotal}
        </Button>
        <span className="faint row" style={{ gap: 6 }} title="Comments arrive in Stage 3">
          <Icon name="message" size={18} />{post.comments}<span className="sr-only"> comments (commenting arrives in a later stage)</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Button variant="ghost" size="sm" icon="flag" onClick={() => setReportOpen(true)} aria-label={`Report post by ${post.author.displayName}`}>Report</Button>
        </span>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {reportOpen && (
        <Dialog open onClose={() => setReportOpen(false)} title="Reporting isn’t connected yet">
          <p>In the real FREEVERSE, a report goes to a human moderator, who reviews it within a defined timeframe. That workflow arrives in Stage 3.</p>
          <p><strong>Nothing was sent.</strong> If someone is in immediate danger, please contact your local emergency services.</p>
        </Dialog>
      )}
    </Card>
  );
}
