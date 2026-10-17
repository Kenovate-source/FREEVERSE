import { useState } from 'react';
import { useApp } from '../app/context';
import { useAsync } from '../hooks/useAsync';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, MockBanner, Notice, PageHeader, Segmented, SkeletonGrid } from '../components/ui';
import { Icon } from '../components/Icon';
import { Link } from '../lib/router';
import { daysUntil, formatDate, formatDateTime } from '../lib/time';
import type { Mentor, Opportunity, OpportunityType } from '../types';

const TYPE_LABEL: Record<OpportunityType, string> = { scholarship: 'Scholarship', internship: 'Internship', grant: 'Grant', entry_level_job: 'Entry-level job' };

function WorkTabs({ active }: { active: 'listings' | 'mentors' }) {
  return (
    <nav aria-label="Opportunities sections" className="seg" style={{ justifySelf: 'start' }}>
      <Link to="/opportunities" className="btn btn-ghost btn-sm" {...(active === 'listings' ? { 'aria-current': 'page' as const, style: { background: 'var(--surface-2)', color: '#fff', borderColor: 'var(--border-strong)' } } : {})}>Listings</Link>
      <Link to="/opportunities/mentors" className="btn btn-ghost btn-sm" {...(active === 'mentors' ? { 'aria-current': 'page' as const, style: { background: 'var(--surface-2)', color: '#fff', borderColor: 'var(--border-strong)' } } : {})}>Mentors</Link>
    </nav>
  );
}

export function Opportunities() {
  const { api, mode } = useApp();
  const [type, setType] = useState<'all' | OpportunityType>('all');
  const r = useAsync(() => api.getOpportunities(type === 'all' ? {} : { type }), [api, mode, type]);

  return (
    <div className="stack-lg">
      <PageHeader title="Opportunities" intro="Scholarships, internships, grants and entry-level roles. You apply on the organisation’s own site." />
      <WorkTabs active="listings" />
      <MockBanner>Every listing below is a fictional sample. Application links are not live, and nothing can be submitted from FREEVERSE.</MockBanner>
      <Notice icon="shield">In the live product each listing is reviewed by the FREEVERSE team before it’s published. Never pay to apply, and be wary of anyone pressuring you to decide quickly.</Notice>
      <Segmented<'all' | OpportunityType> label="Filter by type" value={type} onChange={setType} options={[
        { value: 'all', label: 'All' }, { value: 'scholarship', label: 'Scholarships' }, { value: 'internship', label: 'Internships' }, { value: 'grant', label: 'Grants' }, { value: 'entry_level_job', label: 'Entry-level jobs' },
      ]} />
      <section aria-labelledby="opp-h" aria-live="polite">
        <h2 id="opp-h" className="sr-only">Listings</h2>
        {r.state.status === 'loading' && <SkeletonGrid label="Loading listings" />}
        {r.state.status === 'error' && <Card><ErrorState title="We couldn’t load listings" message={r.state.error.message} onRetry={r.reload} /></Card>}
        {r.state.status === 'success' && r.state.data.length === 0 && (
          <Card><EmptyState icon="briefcase" title="No listings here yet" action={type !== 'all' ? <Button onClick={() => setType('all')}>Show all listings</Button> : undefined}>
            {type === 'all' ? 'Listings are added after review by the FREEVERSE team.' : 'Nothing matches this filter right now.'}
          </EmptyState></Card>
        )}
        {r.state.status === 'success' && r.state.data.length > 0 && <ul className="grid-cards">{r.state.data.map((o) => <li key={o.id}><OppCard o={o} /></li>)}</ul>}
      </section>
    </div>
  );
}

function OppCard({ o }: { o: Opportunity }) {
  const days = daysUntil(o.deadline, Date.now());
  return (
    <Card as="article" className="item-card">
      <div className="row-wrap"><Badge tone="cyan">{TYPE_LABEL[o.type]}</Badge><Badge tone={days <= 10 ? 'pink' : 'default'}>{days} days left</Badge></div>
      <h3>{o.title}</h3>
      <p className="faint">{o.organization}</p>
      <p className="muted">{o.summary}</p>
      <div className="meta"><span><Icon name="pin" size={14} /> {o.location}</span><span>Deadline {formatDate(o.deadline)}</span></div>
      <div className="stack-sm">
        <Button variant="secondary" size="sm" icon="external" disabled aria-describedby={`apply-${o.id}`}>Apply on organisation’s site</Button>
        <span id={`apply-${o.id}`} className="faint">Sample listing: the application link isn’t live.</span>
      </div>
    </Card>
  );
}

export function Mentors() {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getMentors(), [api, mode]);

  return (
    <div className="stack-lg">
      <PageHeader title="Mentors" intro="Experienced people who’ve volunteered to share what they know. Request an introduction and the FREEVERSE team will help make first contact." />
      <WorkTabs active="mentors" />
      <MockBanner>Mentors are fictional. Requesting an introduction here only records it in your browser. No one is contacted.</MockBanner>
      {r.state.status === 'loading' && <SkeletonGrid count={4} label="Loading mentors" />}
      {r.state.status === 'error' && <Card><ErrorState title="We couldn’t load mentors" message={r.state.error.message} onRetry={r.reload} /></Card>}
      {r.state.status === 'success' && r.state.data.mentors.length === 0 && <Card><EmptyState icon="users" title="No mentors listed yet">The FREEVERSE team is recruiting mentors. Check back soon.</EmptyState></Card>}
      {r.state.status === 'success' && r.state.data.mentors.length > 0 && (
        <ul className="grid-cards">
          {r.state.data.mentors.map((m) => (
            <li key={m.id}>
              <MentorCard mentor={m} requestedAt={r.state.status === 'success' ? r.state.data.requested[m.id] : undefined}
                onRequested={(at) => r.update((prev) => ({ ...prev, requested: { ...prev.requested, [m.id]: at } }))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MentorCard({ mentor, requestedAt, onRequested }: { mentor: Mentor; requestedAt: string | undefined; onRequested: (at: string) => void }) {
  const { api } = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function request() {
    setPending(true); setError(null);
    try { onRequested(await api.requestIntro(mentor.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t record the request.'); } finally { setPending(false); }
  }
  return (
    <Card as="article" className="item-card">
      <div className="row"><Avatar name={mentor.name} hue={mentor.hue} size={52} /><div><h3>{mentor.name}</h3><p className="faint">{mentor.headline}</p></div></div>
      <p className="muted">{mentor.bio}</p>
      <div className="row-wrap">{mentor.expertise.map((e) => <Badge key={e} tone="violet">{e}</Badge>)}</div>
      <p className="faint"><Icon name="clock" size={14} /> {mentor.availability}</p>
      {requestedAt ? (
        <p role="status" className="notice" style={{ display: 'block' }}>
          <strong>Request recorded in this browser</strong> on {formatDateTime(requestedAt)}. In the live product the team would now facilitate the introduction. No one has been contacted.
        </p>
      ) : (
        <Button variant="primary" size="sm" disabled={pending} onClick={request}>{pending ? 'Recording…' : 'Request introduction'}</Button>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </Card>
  );
}
