// Visual and interaction identity for each of the fifteen Universes. Pure data, so it is testable and shared by the
// hub, the Universe pages and the tests. Every Universe keeps the shared FREEVERSE language (tokens, type, focus ring);
// what varies is mood, layout rhythm, the signature artwork and how things move. Nothing here changes behaviour.
import type { UniverseId } from './universes';

/** How the page is laid out: calm and ordered, expressive, browse/compare first, or conversational. */
export type UniverseLayout = 'ordered' | 'expressive' | 'browse' | 'social' | 'workshop';
/** Signature artwork drawn from a small set of geometric motifs (see UniverseSigil). */
export type SigilKind = 'constellation' | 'pages' | 'path' | 'council' | 'sunburst' | 'blocks' | 'stalls' | 'lattice' | 'hands' | 'breath' | 'coins' | 'frames' | 'marquee' | 'flasks' | 'pixels';
/** How decoration moves when motion is allowed. Reduced and focus modes always show it still. */
export type MotionLanguage = 'drift' | 'settle' | 'pulse' | 'orbit' | 'rise' | 'snap' | 'ripple';

export interface UniverseTheme {
  id: UniverseId;
  layout: UniverseLayout;
  sigil: SigilKind;
  motion: MotionLanguage;
  /** One-line description of the mood, used as the accessible name of the artwork. */
  mood: string;
  /** Hero artwork depth: 0 flat, 1 subtle layers, 2 layered with pointer parallax (only in exploration mode). */
  depth: 0 | 1 | 2;
}

export const UNIVERSE_THEMES: readonly UniverseTheme[] = [
  { id: 'freeconnect', layout: 'social', sigil: 'constellation', motion: 'orbit', mood: 'Linked points of light, people joined by lines', depth: 2 },
  { id: 'freelearn', layout: 'ordered', sigil: 'pages', motion: 'settle', mood: 'Stacked pages and a steady path forward', depth: 1 },
  { id: 'freework', layout: 'browse', sigil: 'path', motion: 'rise', mood: 'A rising path with waypoints', depth: 1 },
  { id: 'freeai', layout: 'expressive', sigil: 'council', motion: 'pulse', mood: 'A ring of voices around a quiet centre', depth: 2 },
  { id: 'freeevents', layout: 'browse', sigil: 'sunburst', motion: 'pulse', mood: 'Rays gathering toward one place and time', depth: 1 },
  { id: 'freebuild', layout: 'workshop', sigil: 'blocks', motion: 'snap', mood: 'Blocks being fitted together', depth: 1 },
  { id: 'freemarket', layout: 'browse', sigil: 'stalls', motion: 'settle', mood: 'Awnings and stalls laid out to compare', depth: 0 },
  { id: 'freeresearch', layout: 'ordered', sigil: 'lattice', motion: 'settle', mood: 'A lattice of linked sources', depth: 0 },
  { id: 'freevolunteer', layout: 'social', sigil: 'hands', motion: 'ripple', mood: 'Open hands reaching toward each other', depth: 1 },
  { id: 'freehealth', layout: 'ordered', sigil: 'breath', motion: 'drift', mood: 'Slow, calm rings that widen like breathing', depth: 0 },
  { id: 'freefinance', layout: 'ordered', sigil: 'coins', motion: 'settle', mood: 'Steady columns that grow over time', depth: 0 },
  { id: 'freemedia', layout: 'expressive', sigil: 'frames', motion: 'drift', mood: 'Overlapping frames of images and words', depth: 2 },
  { id: 'freeentertainment', layout: 'expressive', sigil: 'marquee', motion: 'pulse', mood: 'Marquee lights and a curtain rising', depth: 2 },
  { id: 'freelabs', layout: 'workshop', sigil: 'flasks', motion: 'ripple', mood: 'Vessels of half-finished ideas', depth: 1 },
  { id: 'freeplay', layout: 'expressive', sigil: 'pixels', motion: 'snap', mood: 'A grid of pixels switching on', depth: 2 },
];

const BY_ID = new Map(UNIVERSE_THEMES.map((t) => [t.id as string, t]));
export function themeFor(id: string): UniverseTheme | undefined { return BY_ID.get(id); }
