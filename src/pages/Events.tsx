import { useState } from 'react';
import { useApp } from '../app/context';
import { useAsync } from '../hooks/useAsync';
import { Badge, Button, Card, EmptyState, ErrorState, MockBanner, PageHeader, SkeletonCards } from '../components/ui';
import { Icon } from '../components/Icon';
import { formatDateTime } from '../lib/time';
import type { EventItem, RsvpResponse } from '../types';

const RSVP: { value: RsvpResponse; label: string }[] = [
  { value: 'yes', label: 'Going' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'Can’t go' },
];

export function Events() {
  const { api, mode } = useApp();
  const r = useAsync(() => api.getEvents(), [api, mode]);
  return (
    <div className="stack-lg">
      <PageHeader title="Events" intro="Workshops, meetups and Q&As, virtual and in person. RSVP so organisers know how many to expect." />
      <MockBanner>All events are fictional samples. RSVPs are saved only in this browser and aren’t sent to any organiser. Joining links are not live.</MockBanner>
      {r.state.status === 'loading' && <SkeletonCards count={3} label="Loading events" />}
      {r.state.status === 'error' && <Card><ErrorState title="We couldn’t load events" message={r.state.error.message} onRetry={r.reload} /></Card>}
      {r.state.status === 'success' && r.state.data.length === 0 && <Card><EmptyState icon="calendar" title="No upcoming events">Events are added by the FREEVERSE team. Check back soon.</EmptyState></Card>}
      {r.state.status === 'success' && r.state.data.length > 0 && (
        <ul className="stack" aria-label="Upcoming events, soonest first">
          {r.state.data.map((e) => (
            <li key={e.id}><EventCard event={e} onChange={(next) => r.update((prev) => prev.map((x) => (x.id === next.id ? next : x)))} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventCard({ event, onChange }: { event: EventItem; onChange: (e: EventItem) => void }) {
  const { api } = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rsvp(value: RsvpResponse) {
    setPending(true); setError(null);
    try { onChange(await api.setRsvp(event.id, event.myRsvp === value ? null : value)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save your RSVP.'); }
    finally { setPending(false); }
  }

  return (
    <Card as="article" className="item-card">
      <div className="row-wrap">
        <Badge tone={event.format === 'virtual' ? 'cyan' : 'pink'}>{event.format === 'virtual' ? 'Virtual' : 'In person'}</Badge>
        <Badge><Icon name="users" size={14} />{event.going} going</Badge>
      </div>
      <h2 style={{ fontSize: '1.2rem' }}>{event.title}</h2>
      <div className="meta">
        <span><Icon name="calendar" size={14} /> <time dateTime={event.startsAt}>{formatDateTime(event.startsAt)}</time></span>
        <span><Icon name="pin" size={14} /> {event.where}</span>
      </div>
      <p className="muted">{event.description}</p>
      <div role="group" aria-label={`RSVP for ${event.title}`} className="row-wrap">
        {RSVP.map((o) => (
          <button key={o.value} type="button" className="chip" aria-pressed={event.myRsvp === o.value} disabled={pending} onClick={() => rsvp(o.value)}>{o.label}</button>
        ))}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </Card>
  );
}
