import type { EnvDef } from '../types';
import { COL, TAU, count, dot, glow, line, ring } from '../kit';
// MESSAGES: a communication network. Nodes are people; small packets travel along real-looking links; each arrival sends a ripple.
export const messages: EnvDef = {
  id: 'messages', label: 'Signal network', focus: 'calm',
  create(c) {
    const N = count(c, 18); const nodes = Array.from({ length: N }, () => ({ x: c.rand(), y: c.rand(), ph: c.rand() * TAU, sp: 0.15 + c.rand() * 0.25 }));
    const edges: [number, number][] = []; const seen = new Set<string>();
    nodes.forEach((a, i) => nodes.map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 })).filter((o) => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 2).forEach((o) => { const k = [i, o.j].sort().join('-'); if (!seen.has(k)) { seen.add(k); edges.push([i, o.j]); } }));
    const packets = Array.from({ length: count(c, 14) }, () => ({ e: Math.floor(c.rand() * edges.length), p: c.rand(), v: 0.12 + c.rand() * 0.2, dir: c.rand() < 0.5 ? 1 : -1 }));
    const ripples: { n: number; born: number }[] = []; const typing = [Math.floor(c.rand() * N), Math.floor(c.rand() * N)];
    let W = 1, H = 1; const pos = (i: number, t: number) => { const n = nodes[i]!; return [(n.x + Math.sin(t * n.sp + n.ph) * 0.012) * W, (n.y + Math.cos(t * n.sp * 0.8 + n.ph) * 0.012) * H] as const; };
    return {
      resize(w, h) { W = w; H = h; },
      draw(t, dt) {
        edges.forEach(([a, b]) => { const [x1, y1] = pos(a, t), [x2, y2] = pos(b, t); line(c, x1, y1, x2, y2, COL.blue, 0.2); });
        nodes.forEach((_, i) => { const [x, y] = pos(i, t); dot(c, x, y, 3, COL.cyan, 0.7); });
        for (const k of packets) {
          k.p += k.v * dt * k.dir; if (k.p > 1 || k.p < 0) { const [a, b] = edges[k.e]!; ripples.push({ n: k.dir > 0 ? b : a, born: t }); k.e = Math.floor(c.rand() * edges.length); k.p = k.dir > 0 ? 0 : 1; k.v = 0.12 + c.rand() * 0.2; }
          const [a, b] = edges[k.e]!; const [x1, y1] = pos(a, t), [x2, y2] = pos(b, t); const x = x1 + (x2 - x1) * k.p, y = y1 + (y2 - y1) * k.p; const tp = k.p - 0.07 * k.dir;
          line(c, x1 + (x2 - x1) * tp, y1 + (y2 - y1) * tp, x, y, COL.cyan, 0.8, 2); glow(c, x, y, 12, COL.cyan, 0.8);
        }
        for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]!; const age = t - r.born; if (age > 1.6) { ripples.splice(i, 1); continue; } const [x, y] = pos(r.n, t); ring(c, x, y, 4 + age * 22, COL.violet, 0.7 * (1 - age / 1.6)); }
        for (const n of typing) { const [x, y] = pos(n, t); for (let k = 0; k < 3; k++) dot(c, x + 8 + k * 5, y - 9, 1.6, COL.pink, 0.4 + 0.5 * Math.max(0, Math.sin(t * 4 - k * 0.8))); }
      },
    };
  },
};
