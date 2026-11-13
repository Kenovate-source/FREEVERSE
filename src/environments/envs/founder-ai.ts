import type { EnvDef } from '../types';
import { COL, TAU, clamp, count, dot, glow, line, ring } from '../kit';
// FOUNDER AI: bounded autonomy. Agents work on the outer orbit and send proposals inward. Every proposal stops at the approval ring
// around the Founder and waits there; only when it is approved does it pass through and settle. Nothing crosses the ring on its own.
export const founderAi: EnvDef = {
  id: 'founder-ai', label: 'Approval', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const N = count(c, 8) + 2; const cols = [COL.cyan, COL.violet, COL.green, COL.blue, COL.amber, COL.coral, COL.steel, COL.pink];
    interface P { from: number; born: number; travel: number; hold: number; dur: number; col: [number, number, number] }
    const props: P[] = []; const settled: { born: number; a: number }[] = []; let next = 0.8;
    const spot = () => ({ cx: W > 760 ? W * 0.74 : W * 0.5, cy: W > 760 ? H * 0.42 : H * 0.27, R: Math.min(W > 760 ? W * 0.21 : W * 0.4, 230) });
    const agent = (i: number, s: { cx: number; cy: number; R: number }, t: number) => { const a = (i / N) * TAU - Math.PI / 2 + t * 0.02; return [s.cx + Math.cos(a) * s.R, s.cy + Math.sin(a) * s.R * 0.8] as const; };
    return {
      resize(w, h) { W = w; H = h; },
      draw(t) {
        const s = spot(); const gate = s.R * 0.4;
        ring(c, s.cx, s.cy, s.R, COL.steel, 0.1); ring(c, s.cx, s.cy, gate, COL.amber, 0.22 + 0.05 * Math.sin(t * 1.4), 1.4);
        for (let i = 0; i < N; i++) { const [x, y] = agent(i, s, t); const act = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.9); line(c, x, y, s.cx, s.cy, COL.steel, 0.04); glow(c, x, y, 20, cols[i % cols.length]!, 0.1 + 0.12 * act); dot(c, x, y, 4, cols[i % cols.length]!, 0.75); }
        glow(c, s.cx, s.cy, 44, COL.gold, 0.2); dot(c, s.cx, s.cy, 7, COL.gold, 0.85);
        if (t > next) { next = t + 1.6 + c.rand() * 1.8; if (props.length < 5) props.push({ from: Math.floor(c.rand() * N), born: t, travel: 2.2, hold: 2 + c.rand() * 3, dur: 1.2, col: COL.pink }); }
        for (let i = props.length - 1; i >= 0; i--) {
          const p = props[i]!; const age = t - p.born; const [x, y] = agent(p.from, s, t); const dx = s.cx - x, dy = s.cy - y, d = Math.hypot(dx, dy) || 1; const stopAt = 1 - gate / d;
          if (age < p.travel) { const u = clamp(age / p.travel) * stopAt; glow(c, x + dx * u, y + dy * u, 9, p.col, 0.6); }
          else if (age < p.travel + p.hold) { const w = age - p.travel; const px = x + dx * stopAt, py = y + dy * stopAt; glow(c, px, py, 12 + 3 * Math.sin(w * 5), COL.amber, 0.55); ring(c, px, py, 7, COL.amber, 0.5, 1.2); }
          else if (age < p.travel + p.hold + p.dur) { const u = stopAt + (1 - stopAt) * clamp((age - p.travel - p.hold) / p.dur); glow(c, x + dx * u, y + dy * u, 9, COL.green, 0.7); }
          else { settled.push({ born: t, a: Math.atan2(-dy, -dx) }); props.splice(i, 1); }
        }
        for (let i = settled.length - 1; i >= 0; i--) { const e = settled[i]!; const w = t - e.born; if (w > 2.4) { settled.splice(i, 1); continue; } ring(c, s.cx, s.cy, 10 + w * 14, COL.green, 0.4 * clamp(1 - w / 2.4), 1.3); }
      },
    };
  },
};
