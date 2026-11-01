import { useState } from 'react';
import { setQuery } from '../../lib/router';
import { Button, Chip, SelectField, TextField } from '../../ui/kit';
import { ANIMATION_STYLES, AVAILABILITY_LABELS, MEDIA_GENRES, MEDIA_LANGUAGES, SESSION_STATUS_LABEL, type SessionStatus } from '../../../shared/media-taxonomy';

/** URL params the media browse understands. Kept in the address bar so a filtered view can be bookmarked or shared. */
export const MEDIA_PARAMS = ['genre', 'language', 'country', 'animation', 'availability', 'yfrom', 'yto', 'q', 'when'] as const;
export const mediaQueryFrom = (query: URLSearchParams) => Object.fromEntries(MEDIA_PARAMS.map((k) => [k, query.get(k) || undefined])) as Record<string, string | undefined>;

export function DiscoverFilters({ query }: { query: URLSearchParams }) {
  const [text, setText] = useState(query.get('q') ?? ''); const [country, setCountry] = useState(query.get('country') ?? '');
  const active = MEDIA_PARAMS.some((k) => query.get(k));
  const sel = (key: string, label: string, options: readonly string[]) => <SelectField label={label} value={query.get(key) ?? ''} onChange={(e) => setQuery({ [key]: e.target.value || null })}><option value="">Any</option>{options.map((o) => <option key={o}>{o}</option>)}</SelectField>;
  return <form className="card stack-sm" role="search" aria-label="Filter titles" onSubmit={(e) => { e.preventDefault(); setQuery({ q: text.trim() || null, country: country.trim() || null }); }}>
    <div className="grid-2"><TextField label="Search by title" type="search" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} /><TextField label="Country or region" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} /></div>
    <div className="grid-2">{sel('genre', 'Genre', MEDIA_GENRES)}{sel('language', 'Original language', MEDIA_LANGUAGES)}{sel('animation', 'Animation style', ANIMATION_STYLES)}{sel('availability', 'How to watch', AVAILABILITY_LABELS)}</div>
    <div className="grid-2"><TextField label="Released from" type="number" inputMode="numeric" value={query.get('yfrom') ?? ''} onChange={(e) => setQuery({ yfrom: e.target.value || null })} /><TextField label="Released up to" type="number" inputMode="numeric" value={query.get('yto') ?? ''} onChange={(e) => setQuery({ yto: e.target.value || null })} /></div>
    <div className="row-wrap"><Button type="submit" variant="primary" size="sm">Search</Button>{active && <Button type="button" size="sm" variant="ghost" onClick={() => { setText(''); setCountry(''); setQuery(Object.fromEntries(MEDIA_PARAMS.map((k) => [k, null]))); }}>Clear filters</Button>}</div>
    <p className="faint">Entries are added by members, so this is a partial, community-built list rather than a complete catalogue.</p>
  </form>;
}

export function SessionFilters({ query }: { query: URLSearchParams }) {
  const cur = query.get('when') ?? '';
  return <div className="row-wrap" role="group" aria-label="Session status"><Chip on={!cur} onClick={() => setQuery({ when: null })}>All</Chip>{(['upcoming', 'live', 'finished'] as SessionStatus[]).map((s) => <Chip key={s} on={cur === s} onClick={() => setQuery({ when: s })}>{SESSION_STATUS_LABEL[s]}</Chip>)}</div>;
}
