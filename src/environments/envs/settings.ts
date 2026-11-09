import type { EnvDef } from '../types';
import { COL, clamp, dot, ease, glow, line, rgba, roundRect } from '../kit';
// SETTINGS: a control environment. Layered plates carry sliders and switches that adjust themselves; each change sends a configuration signal along its track.
export const settings: EnvDef = {
  id: 'settings', label: 'Control surfaces', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const rows = 7;
    const sl = Array.from({ length: rows }, (_, i) => ({ from: c.rand(), to: c.rand(), at: c.rand() * 3 + i * 0.4, dur: 1.2, kind: i % 3 === 2 ? 'switch' : 'slider', pulse: -9 }));
    return {
      resize(w, h) { W = w; H = h; },
      draw(t) {
        const x0 = W * 0.52, x1 = W * 0.96, top = H * 0.16, gap = Math.min(70, (H * 0.7) / rows);
        [[0, 0, 0.05], [12, 10, 0.04], [24, 20, 0.03]].forEach(([dx, dy, a]) => { roundRect(c, x0 - 20 + dx!, top - 22 + dy!, x1 - x0 + 40, gap * rows + 20, 16); c.ctx.strokeStyle = rgba(COL.steel, a! * 3); c.ctx.lineWidth = 1; c.ctx.stroke(); c.ctx.fillStyle = rgba(COL.steel, a!); c.ctx.fill(); });
        sl.forEach((s, i) => {
          if (t > s.at + s.dur + 2.5) { s.from = s.to; s.to = c.rand(); s.at = t + 0.2; s.pulse = -9; }
          const u = clamp((t - s.at) / s.dur); const v = s.from + (s.to - s.from) * ease(u); if (u >= 1 && s.pulse < -1) s.pulse = t; const y = top + i * gap + 12;
          if (s.kind === 'slider') { line(c, x0, y, x1, y, COL.steel, 0.2, 2); line(c, x0, y, x0 + (x1 - x0) * v, y, COL.blue, 0.4, 2); const x = x0 + (x1 - x0) * v; glow(c, x, y, 16, COL.blue, 0.4); dot(c, x, y, 5.5, COL.cyan, 0.8);
            const p = (t - s.pulse) * 0.5; if (p >= 0 && p < 1) glow(c, x + (x1 - x) * p, y, 8, COL.cyan, 0.5 * (1 - p)); }
          else { const on = v > 0.5; const w = 46, h = 22; const kx = x0 + w * (on ? 0.7 : 0.3) ; roundRect(c, x0, y - h / 2, w, h, 11); c.ctx.fillStyle = rgba(on ? COL.green : COL.steel, on ? 0.25 : 0.12); c.ctx.fill(); c.ctx.strokeStyle = rgba(on ? COL.green : COL.steel, 0.4); c.ctx.lineWidth = 1; c.ctx.stroke(); dot(c, kx, y, 7, on ? COL.green : COL.steel, 0.7); line(c, x0 + w + 12, y, x1, y, COL.steel, 0.1); }
        });
      },
    };
  },
};
