import type { EnvDef } from '../types';
import { COL, TAU, clamp, dot, glow, line, ring } from '../kit';
// AI COUNCIL: coordinating agents. Nine specialists share information with their neighbours, and now and then one sends a finding along its
// spoke to the Founder at the centre, where it waits as a decision ring until it is answered.
export const council: EnvDef = {
  id: 'council', label: 'Coordination', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const N = 9; const cols = [COL.cyan, COL.violet, COL.green, COL.amber, COL.pink, COL.blue, COL.gold, COL.coral, COL.steel];
    const chords: [number, number][] = [[0, 3], [1, 5], [2, 7], [4, 8], [6, 1]]; interface F { from: number; born: number; dur: number }
    const finds: F[] = []; const flows = Array.from({ length: 10 }, () => ({ a: Math.floor(c.rand() * N), p: c.rand(), v: 0.15 + c.rand() * 0.2, hop: 0 })); let next = 1;
    const pos = (i: number, cx: number, cy: number, R: number, t: number) => { const a = (i / N) * TAU - Math.PI / 2 + t * 0.012; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.78] as const; };
    return {
      resize(w, h) { W = w; H = h; },
      draw(t, dt) {
        const cx = W > 760 ? W * 0.72 : W * 0.5, cy = W > 760 ? H * 0.4 : H * 0.26; const R = Math.min(W > 760 ? W * 0.22 : W * 0.4, 230);
        for (let i = 0; i < N; i++) { const [x1, y1] = pos(i, cx, cy, R, t), [x2, y2] = pos((i + 1) % N, cx, cy, R, t); line(c, x1, y1, x2, y2, COL.steel, 0.12); line(c, x1, y1, cx, cy, COL.violet, 0.05); }
        chords.forEach(([a, b]) => { const [x1, y1] = pos(a, cx, cy, R, t), [x2, y2] = pos(b, cx, cy, R, t); line(c, x1, y1, x2, y2, COL.steel, 0.07); });
        for (const f of flows) { f.p += f.v * dt; if (f.p >= 1) { f.p = 0; f.a = (f.a + 1) % N; } const [x1, y1] = pos(f.a, cx, cy, R, t), [x2, y2] = pos((f.a + 1) % N, cx, cy, R, t); glow(c, x1 + (x2 - x1) * f.p, y1 + (y2 - y1) * f.p, 7, cols[f.a]!, 0.5); }
        for (let i = 0; i < N; i++) { const [x, y] = pos(i, cx, cy, R, t); const act = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 1.7); glow(c, x, y, 22, cols[i]!, 0.1 + 0.15 * act); dot(c, x, y, 4.2, cols[i]!, 0.75); }
        glow(c, cx, cy, 46, COL.gold, 0.2); dot(c, cx, cy, 7, COL.gold, 0.8);
        if (t > next) { next = t + 2.5 + c.rand() * 2.5; if (finds.length < 4) finds.push({ from: Math.floor(c.rand() * N), born: t, dur: 1.8 }); }
        for (let i = finds.length - 1; i >= 0; i--) { const f = finds[i]!; const age = t - f.born; const [x, y] = pos(f.from, cx, cy, R, t);
          if (age < f.dur) { const u = clamp(age / f.dur); glow(c, x + (cx - x) * u, y + (cy - y) * u, 10, COL.pink, 0.7); line(c, x, y, x + (cx - x) * u, y + (cy - y) * u, COL.pink, 0.3, 1.5); }
          else { const w = age - f.dur; ring(c, cx, cy, 16 + (i % 2) * 6 + Math.sin(w * 3) * 2, COL.pink, 0.4 * clamp(1 - w / 6), 1.4); if (w > 6) finds.splice(i, 1); } }
      },
    };
  },
};
