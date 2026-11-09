import type { EnvDef } from '../types';
import { COL, TAU, count, glow, ring } from '../kit';
// NOVA: a reflective companion. One large orb that breathes slowly, ripples that leave it unhurriedly, and thought-motes that spiral upward and fade.
export const nova: EnvDef = {
  id: 'nova', label: 'Breathing orb', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const motes = Array.from({ length: count(c, 40) }, () => ({ a: c.rand() * TAU, r: 30 + c.rand() * 120, h: c.rand(), sp: 0.05 + c.rand() * 0.12, s: 1 + c.rand() * 2, col: c.rand() < 0.5 ? COL.violet : COL.cyan }));
    return {
      resize(w, h) { W = w; H = h; },
      draw(t, dt) {
        const cx = W > 760 ? W * 0.76 : W * 0.5, cy = W > 760 ? H * 0.38 : H * 0.24; const k = W > 760 ? 1 : 0.7; const breath = 1 + Math.sin(t * 0.7) * 0.07;
        glow(c, cx, cy, 190 * k * breath, COL.violet, 0.2); glow(c, cx, cy, 100 * k * breath, COL.blue, 0.28); glow(c, cx, cy, 46 * k * breath, COL.cyan, 0.5);
        for (let i = 0; i < 3; i++) { const p = ((t * 0.12) + i / 3) % 1; ring(c, cx, cy, (60 + p * 220) * k, COL.violet, 0.28 * (1 - p), 1.2); }
        for (const m of motes) { m.h += m.sp * dt; if (m.h > 1) { m.h = 0; m.a = c.rand() * TAU; } const rr = (m.r * (1 - m.h * 0.35)) * k; const a = m.a + m.h * 4; const x = cx + Math.cos(a) * rr, y = cy - m.h * 210 * k + Math.sin(a) * rr * 0.25; glow(c, x, y, 5 + m.s * 2, m.col, 0.6 * Math.sin(m.h * Math.PI)); }
      },
    };
  },
};
