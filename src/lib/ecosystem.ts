// Pure model for the Founder ecosystem map. Everything here is derived from real data:
// the overview figures from the server, and the Universe cross-links defined in shared/universe-spaces.ts.
// Nothing is simulated. Where a link only shows that a relationship exists (not traffic), it says so.
import { UNIVERSES } from '../../shared/universes';
import { specFor } from '../../shared/universe-spaces';

export type LinkKind = 'citizen' | 'safety' | 'decision' | 'universe' | 'contains';
export interface KindInfo { id: LinkKind; label: string; colour: string; means: string; measured: boolean }
export const KINDS: readonly KindInfo[] = [
  { id: 'citizen', label: 'Citizen activity', colour: '#2fd8ee', means: 'People joining, posting and commenting. Particle count follows the last 7 days of real posts and comments.', measured: true },
  { id: 'safety', label: 'Safety and oversight', colour: '#ffb067', means: 'Reports and cases flow from communities to moderators and on to governance. Shows that the relationship exists; it does not measure volume.', measured: false },
  { id: 'decision', label: 'Decisions and proposals', colour: '#b69cff', means: 'Founder AI findings and citizen suggestions become proposals that wait for your approval.', measured: false },
  { id: 'universe', label: 'Universe to Universe', colour: '#6ee7a8', means: 'One Universe points its members to another (the “Related Universes” each Universe lists). An arrow each way means they point to each other.', measured: false },
  { id: 'contains', label: 'Part of', colour: '#8793c9', means: 'A Universe belongs to the Universes part of the platform.', measured: false },
];

export interface MapNode { id: string; label: string; ring: 'area' | 'universe'; x: number; y: number; active: boolean; level?: 'calm' | 'watch' | 'act'; status?: string; accent?: string; value?: string }
export interface MapLink { id: string; from: string; to: string; kind: LinkKind; active: boolean; both: boolean; particles: number }
export const W = 900, H = 620, CX = 450, CY = 310;

const AREA_ANGLE: Record<string, number> = { citizens: -90, communities: -38, universes: 14, safety: 66, governance: 118, ai: 170, suggestions: 222 };
const ang = (deg: number, rx: number, ry: number) => ({ x: CX + rx * Math.cos((deg * Math.PI) / 180), y: CY + ry * Math.sin((deg * Math.PI) / 180) });

/** Universe → Universes it points its members to (from the Universe’s own definition). */
export function universeEdges(): { from: string; to: string }[] {
  const ids = new Set(UNIVERSES.map((u) => u.id)); const out: { from: string; to: string }[] = [];
  for (const u of UNIVERSES) for (const r of specFor(u.id)?.related ?? []) if (ids.has(r) && r !== u.id) out.push({ from: u.id, to: r });
  return out;
}
export const isLive = (status: string) => status === 'available' || status === 'partial';

interface AreaIn { id: string; label: string; value: string; level: 'calm' | 'watch' | 'act' }
export function buildMap(areas: AreaIn[], universes: { id: string; name: string; status: string }[], platform: { key: string; value: number | string }[]) {
  const num = (k: string) => Number(platform.find((p) => p.key === k)?.value ?? 0);
  const activity = num('posts_7d') + num('comments_7d');
  const citizenParticles = activity >= 50 ? 3 : activity >= 10 ? 2 : activity > 0 ? 1 : 0;
  const nodes: MapNode[] = [{ id: 'core', label: 'FREEVERSE', ring: 'area', x: CX, y: CY, active: true }];
  for (const a of areas) { const p = ang(AREA_ANGLE[a.id] ?? 0, 165, 118); nodes.push({ id: a.id, label: a.label, ring: 'area', ...p, active: a.value !== '0' && a.value !== '0/0', level: a.level, value: a.value }); }
  const accent = new Map(UNIVERSES.map((u) => [u.id, u.accent])); const n = universes.length;
  universes.forEach((u, i) => { const p = ang(-90 + (360 / n) * i, 385, 262); nodes.push({ id: u.id, label: u.name, ring: 'universe', ...p, active: isLive(u.status), status: u.status, accent: accent.get(u.id) }); });
  const live = new Map(nodes.map((x) => [x.id, x.active]));
  const links: MapLink[] = []; const add = (from: string, to: string, kind: LinkKind, particles: number, both = false) => { if (nodes.some((x) => x.id === from) && nodes.some((x) => x.id === to)) links.push({ id: `${kind}:${from}>${to}`, from, to, kind, active: !!live.get(from) && !!live.get(to), both, particles }); };
  for (const a of areas) add('core', a.id, 'contains', 0);
  add('citizens', 'communities', 'citizen', citizenParticles); add('citizens', 'universes', 'citizen', citizenParticles ? 1 : 0);
  add('communities', 'safety', 'safety', 1); add('safety', 'governance', 'safety', 1, true);
  add('ai', 'governance', 'decision', 1); add('suggestions', 'governance', 'decision', 1);
  for (const u of universes) add('universes', u.id, 'contains', 0);
  add('communities', 'freeconnect', 'citizen', citizenParticles);
  const seen = new Set<string>();
  for (const e of universeEdges()) { if (!universes.some((u) => u.id === e.from) || !universes.some((u) => u.id === e.to)) continue; const k = [e.from, e.to].sort().join('|'); if (seen.has(k)) continue; seen.add(k); const mutual = universeEdges().some((x) => x.from === e.to && x.to === e.from); add(e.from, e.to, 'universe', 1, mutual); }
  return { nodes, links, citizenParticles };
}

/** What changing a Universe would touch: who points to it, and who it points to. Plain words. */
export function universeImpact(id: string) {
  const edges = universeEdges(); const name = new Map(UNIVERSES.map((u) => [u.id, u.name]));
  return { pointsTo: edges.filter((e) => e.from === id).map((e) => ({ id: e.to, name: name.get(e.to) ?? e.to })), pointedFromBy: edges.filter((e) => e.to === id).map((e) => ({ id: e.from, name: name.get(e.from) ?? e.from })) };
}
/** Adjacency matrix for view A. */
export function relationMatrix(universes: { id: string; name: string }[]) {
  const edges = universeEdges(); return universes.map((r) => ({ id: r.id, name: r.name, cells: universes.map((c) => ({ id: c.id, name: c.name, on: edges.some((e) => e.from === r.id && e.to === c.id), mutual: edges.some((e) => e.from === r.id && e.to === c.id) && edges.some((e) => e.from === c.id && e.to === r.id) })) }));
}
