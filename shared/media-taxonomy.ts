// Media discovery vocabulary. One place to extend: add a value here and every form, filter and validator picks it up.
// These lists are suggestions for filtering, not a claim to cover all existing or future titles; "Other" is always allowed.

export const MEDIA_FORMATS = ['Feature film', 'Short film', 'Series', 'Documentary', 'Animation', 'Anime', 'K-drama', 'Independent', 'Comedy special', 'Music', 'Podcast', 'Book', 'Game', 'Other'] as const;
export const MEDIA_GENRES = ['Action', 'Adventure', 'Comedy', 'Crime', 'Drama', 'Fantasy', 'Historical', 'Horror', 'Musical', 'Mystery', 'Romance', 'Sci-fi', 'Slice of life', 'Thriller', 'War', 'Family', 'Other'] as const;
export const ANIMATION_STYLES = ['Not animated', '2D hand-drawn', '2D digital', '3D / CGI', 'Stop-motion', 'Anime', 'Mixed', 'Other'] as const;
export const MEDIA_LANGUAGES = ['English', 'Yoruba', 'Igbo', 'Hausa', 'French', 'Spanish', 'Portuguese', 'Arabic', 'Hindi', 'Korean', 'Japanese', 'Mandarin', 'Swahili', 'Other'] as const;

/** How a viewer can legitimately reach the thing. FREEVERSE hosts no film or series; it only describes where it lives. */
export const AVAILABILITY = [
  { id: 'external', label: 'External destination', blurb: 'Watch on the service that carries it. Availability and cost are set by that service.', link: true },
  { id: 'public_domain', label: 'Public domain', blurb: 'Free to watch and share; the link goes to a public-domain source.', link: true },
  { id: 'licensed', label: 'Licensed', blurb: 'Offered by the rights holder or a licensed provider.', link: true },
  { id: 'creator_permission', label: 'Shared with permission', blurb: 'The person sharing it has the rights holder’s permission to share it.', link: true },
  { id: 'user_created', label: 'Made by the sharer', blurb: 'Created by the person who shared it.', link: true },
  { id: 'info_only', label: 'Information only', blurb: 'Discussion and details only. There is no viewing link, either because it is not legitimately available to link or because it is not available at all.', link: false },
] as const;
export type AvailabilityId = (typeof AVAILABILITY)[number]['id'];
export const AVAILABILITY_LABELS = AVAILABILITY.map((a) => a.label);
export const availabilityByLabel = (label: string | undefined) => AVAILABILITY.find((a) => a.label === label);

export const WATCH_DEFAULT_MINUTES = 120;
export type SessionStatus = 'upcoming' | 'live' | 'finished';
/** upcoming / live / finished from a start time and length. Pure, so the server, the page and the tests agree. */
export function sessionStatus(startsAt: string | undefined, minutes: number | undefined, nowMs: number): SessionStatus | null {
  const start = startsAt ? Date.parse(startsAt) : NaN; if (!Number.isFinite(start)) return null;
  const end = start + (minutes && minutes > 0 ? minutes : WATCH_DEFAULT_MINUTES) * 60_000;
  return nowMs < start ? 'upcoming' : nowMs < end ? 'live' : 'finished';
}
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = { upcoming: 'Upcoming', live: 'Live now', finished: 'Finished' };

/** Filters the feed accepts for Universe posts, mapped to the template field each reads. Keys are whitelisted on the server. */
export const META_FILTERS = { format: 'medium', genre: 'genre', language: 'language', country: 'country', animation: 'animation', availability: 'availability' } as const;
export type MetaFilterKey = keyof typeof META_FILTERS;
