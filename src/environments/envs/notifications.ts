import type { EnvDef } from '../types';
import { COL, TAU, clamp, dot, glow, line, ring } from '../kit';
// NOTIFICATIONS: a receiver at the centre with priority bands. Signals arrive from outside, travel in, and settle in the band that matches
// their importance; simultaneous related events are linked for a moment.
export const notifications: EnvDef = {
  id: 'notifications', label: 'Signal receiver', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const BANDS = [{ r: 70, col: COL.pink, size: 5 }, { r: 135, col: COL.amber, size: 3.6 }, { r: 205, col: COL.cyan, size: 2.6 }];
    interface Sig { a: number; band: number; born: number; arrive: number; settled: number; link: boolean }
    const sigs: Sig[] = []; let next = 0.5;
    return {
      resize(w, h) { W = w; H = h; },
      draw(t) {
        const cx = W > 760 ? W * 0.74 : W * 0.5, cy = W > 760 ? H * 0.42 : H * 0.28; const R = Math.hypot(W, H) * 0.55;
        BANDS.forEach((b, i) => ring(c, cx, cy, b.r, b.col, 0.1 + 0.03 * Math.sin(t * 0.8 + i), 1)); glow(c, cx, cy, 40, COL.violet, 0.25); dot(c, cx, cy, 5, COL.violet, 0.6);
        if (t > next) { next = t + 0.8 + c.rand() * 1.8; const band = c.rand() < 0.18 ? 0 : c.rand() < 0.5 ? 1 : 2; sigs.push({ a: c.rand() * TAU, band, born: t, arrive: 1.6 + c.rand() * 0.8, settled: 0, link: c.rand() < 0.35 }); if (sigs.length > Math.round(26 * c.density)) sigs.shift(); }
        const placed: [number, number, number][] = [];
        for (const s of sigs) {
          const B = BANDS[s.band]!; const age = t - s.born; const u = clamp(age / s.arrive);
          if (u < 1) { const e = 1 - (1 - u) ** 2; const r = R + (B.r - R) * e; const x = cx + Math.cos(s.a) * r, y = cy + Math.sin(s.a) * r; line(c, x, y, cx + Math.cos(s.a) * (r + 30), cy + Math.sin(s.a) * (r + 30), B.col, 0.4, 1.4); glow(c, x, y, 7 + B.size, B.col, 0.55); }
          else { if (!s.settled) s.settled = t; const since = t - s.settled; const a = s.a + since * 0.07 * (s.band % 2 ? 1 : -1); const x = cx + Math.cos(a) * B.r, y = cy + Math.sin(a) * B.r; const fade = clamp(1 - (since - 5) / 3);
            if (since < 0.9) ring(c, x, y, B.size + since * 26, B.col, 0.5 * (1 - since / 0.9)); dot(c, x, y, B.size, B.col, 0.7 * fade); placed.push([x, y, fade]); if (s.link && placed.length > 1) { const p = placed[placed.length - 2]!; line(c, p[0], p[1], x, y, COL.violet, 0.18 * fade * p[2]); } }
        }
      },
    };
  },
};
