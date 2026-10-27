// The camera and scene state for each chapter of the landing journey, and how they blend while scrolling.
// Pure data and maths: unit-testable without a browser or WebGL.
export type Layer = 'identity' | 'nodes' | 'links' | 'labels' | 'paths' | 'pulses' | 'shells' | 'glow';
export type Group = 'knowledge' | 'community' | 'work' | 'media';
export interface Key {
  camZ: number; camY: number; y?: number;
  /** Horizontal offset of the whole constellation, as a fraction of the wide-screen offset (the scene steps aside for text). */
  x: number;
  rotY: number; rotX: number;
  layers: Record<Layer, number>;
  highlight: Group | null;
}
const L = (o: Partial<Record<Layer, number>>): Record<Layer, number> => ({ identity: 0, nodes: 0, links: 0, labels: 0, paths: 0, pulses: 0, shells: 0, glow: 0.6, ...o });

/** One entry per chapter, in page order. */
export const KEYS: readonly Key[] = [
  /* 0 vision    */ { camZ: 9.5, camY: 0.2, x: 1.0, rotY: 0.0, rotX: 0.1, layers: L({ glow: 1 }), highlight: null },
  /* 1 identity  */ { camZ: 8.6, camY: 0.4, x: -0.8, rotY: 0.5, rotX: 0.25, layers: L({ identity: 1, glow: 0.9 }), highlight: null },
  /* 2 universes */ { camZ: 19, camY: 0.4, y: -1.0, x: 0, rotY: 0.9, rotX: 0.15, layers: L({ identity: 0.25, nodes: 1, links: 0.55, labels: 1 }), highlight: null },
  /* 3 knowledge */ { camZ: 10.5, camY: 0.3, x: 0.9, rotY: 1.55, rotX: 0.1, layers: L({ nodes: 1, links: 0.9, labels: 0 }), highlight: 'knowledge' },
  /* 4 community */ { camZ: 10.5, camY: 0.2, x: -0.9, rotY: 2.6, rotX: 0.05, layers: L({ nodes: 1, links: 1, labels: 0 }), highlight: 'community' },
  /* 5 work      */ { camZ: 10.5, camY: 0.4, x: 0.9, rotY: 3.7, rotX: 0.15, layers: L({ nodes: 1, links: 0.7, labels: 0, paths: 1 }), highlight: 'work' },
  /* 6 media     */ { camZ: 10.5, camY: 0.3, x: -0.9, rotY: 4.8, rotX: 0.1, layers: L({ nodes: 1, links: 0.7, labels: 0, pulses: 1 }), highlight: 'media' },
  /* 7 trust     */ { camZ: 9.2, camY: 1.2, x: 0, rotY: 5.6, rotX: 0.95, layers: L({ nodes: 0.2, shells: 1, glow: 0.8 }), highlight: null },
  /* 8 invite    */ { camZ: 8.2, camY: 0.3, x: 0, rotY: Math.PI * 2, rotX: 0.12, layers: L({ identity: 0.6, nodes: 0.7, links: 0.4, glow: 1 }), highlight: null },
];

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fractional chapter position t (0..KEYS.length-1) -> the two neighbouring chapters and the blend between them. */
export function span(t: number, n = KEYS.length): { i: number; j: number; f: number } {
  const c = Math.min(n - 1, Math.max(0, t)); const i = Math.floor(c); const j = Math.min(n - 1, i + 1);
  return { i, j, f: smooth(c - i) };
}
export function mixKey(t: number, keys: readonly Key[] = KEYS): Omit<Key, 'highlight'> & { hl: Record<Group, number> } {
  const { i, j, f } = span(t, keys.length); const a = keys[i]!, b = keys[j]!;
  const layers = {} as Record<Layer, number>;
  for (const k of Object.keys(a.layers) as Layer[]) layers[k] = lerp(a.layers[k], b.layers[k], f);
  const hl: Record<Group, number> = { knowledge: 0, community: 0, work: 0, media: 0 };
  if (a.highlight) hl[a.highlight] += 1 - f; if (b.highlight) hl[b.highlight] += f;
  return { camZ: lerp(a.camZ, b.camZ, f), camY: lerp(a.camY, b.camY, f), y: lerp(a.y ?? 0, b.y ?? 0, f), x: lerp(a.x, b.x, f), rotY: lerp(a.rotY, b.rotY, f), rotX: lerp(a.rotX, b.rotX, f), layers, hl };
}

/** Deterministic constellation: four sectors (one per highlight group) around the core. Returns [x,y,z] per node index within its group. */
export function placeNodes<T extends { id: string; group: Group }>(nodes: readonly T[], radius = 4.6): Map<string, [number, number, number]> {
  const sector: Record<Group, number> = { knowledge: 0, community: 1, work: 2, media: 3 };
  const byGroup = new Map<Group, T[]>(); for (const n of nodes) byGroup.set(n.group, [...(byGroup.get(n.group) ?? []), n]);
  const out = new Map<string, [number, number, number]>();
  for (const [g, arr] of byGroup) {
    arr.forEach((n, k) => {
      const spread = 0.9; const base = sector[g] * (Math.PI / 2) + (Math.PI / 4) * 0;      // sector centre angle
      const ang = base + (arr.length === 1 ? 0 : (k / (arr.length - 1) - 0.5) * spread);
      const elev = ((k % 2 === 0 ? 1 : -1) * (0.3 + 0.12 * (k % 3))) + (k === 2 ? 0.1 : 0);               // alternate above/below the plane
      const r = radius * (0.92 + 0.16 * ((k * 37 + sector[g] * 11) % 5) / 4);
      out.set(n.id, [Math.cos(ang) * r * Math.cos(elev), Math.sin(elev) * r, Math.sin(ang) * r * Math.cos(elev)]);
    });
  }
  return out;
}
