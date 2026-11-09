import type { EnvDef } from '../types';
import { COL, TAU, count, dot, glow, line } from '../kit';
// COMMUNITIES: independent groups. Each hub has its own members circling it; bridges between hubs carry people and ideas both ways.
export const communities: EnvDef = {
  id: 'communities', label: 'Groups and bridges', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const cols = [COL.cyan, COL.green, COL.violet, COL.amber, COL.pink];
    const hubs = [[0.16, 0.3], [0.42, 0.18], [0.7, 0.34], [0.3, 0.72], [0.82, 0.74]].map(([x, y], i) => ({ x: x!, y: y!, col: cols[i]!, ph: i * 1.3, m: Array.from({ length: count(c, 11) }, () => ({ a: c.rand() * TAU, r: 22 + c.rand() * 30, sp: (0.2 + c.rand() * 0.5) * (c.rand() < 0.5 ? 1 : -1) })) }));
    const bridges: [number, number][] = [[0, 1], [1, 2], [0, 3], [2, 4], [3, 4], [1, 4]]; const riders = bridges.flatMap((b, i) => [{ b: i, p: c.rand(), v: 0.05 + c.rand() * 0.07, d: 1 }, { b: i, p: c.rand(), v: 0.04 + c.rand() * 0.06, d: -1 }]);
    const at = (i: number, t: number) => { const h = hubs[i]!; return [(h.x + Math.sin(t * 0.2 + h.ph) * 0.01) * W, (h.y + Math.cos(t * 0.17 + h.ph) * 0.012) * H] as const; };
    return {
      resize(w, h) { W = w; H = h; },
      draw(t, dt) {
        bridges.forEach(([a, b]) => { const [x1, y1] = at(a, t), [x2, y2] = at(b, t); line(c, x1, y1, x2, y2, COL.steel, 0.1); });
        hubs.forEach((h, i) => { const [x, y] = at(i, t); glow(c, x, y, 70, h.col, 0.12); dot(c, x, y, 5, h.col, 0.6); h.m.forEach((m) => { const a = m.a + t * m.sp; dot(c, x + Math.cos(a) * m.r, y + Math.sin(a) * m.r * 0.8, 1.8, h.col, 0.5); }); });
        for (const r of riders) { r.p += r.v * dt * r.d; if (r.p > 1) r.p = 0; if (r.p < 0) r.p = 1; const [a, b] = bridges[r.b]!; const [x1, y1] = at(a, t), [x2, y2] = at(b, t); const x = x1 + (x2 - x1) * r.p, y = y1 + (y2 - y1) * r.p; glow(c, x, y, 8, hubs[r.d > 0 ? a : b]!.col, 0.55); }
      },
    };
  },
};
