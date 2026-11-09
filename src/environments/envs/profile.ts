import type { EnvDef } from '../types';
import { COL, TAU, count, dot, glow, ring } from '../kit';
// PROFILE: a personal identity environment. A central identity light with layered rings; personal items orbit it at their own speeds;
// milestones light up in turn along the outer layer. Items are abstract shapes: nothing here depicts or assumes a gender or appearance.
export const profile: EnvDef = {
  id: 'profile', label: 'Identity orbit', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const layers = [{ r: 84, tilt: 0.42, rot: -0.35 }, { r: 130, tilt: 0.5, rot: 0.2 }, { r: 188, tilt: 0.38, rot: 0.55 }];
    const items = Array.from({ length: count(c, 12) }, (_, i) => ({ l: i % 3, a: c.rand() * TAU, sp: (0.12 + c.rand() * 0.28) * (c.rand() < 0.5 ? 1 : -1), shape: i % 4, size: 3 + c.rand() * 3, col: [COL.violet, COL.pink, COL.cyan, COL.gold][i % 4]! }));
    const miles = Array.from({ length: 6 }, (_, i) => (i / 6) * TAU + 0.3);
    const P = (r: number, tilt: number, rot: number, a: number, cx: number, cy: number) => { const x = Math.cos(a) * r, y = Math.sin(a) * r * tilt; return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)] as const; };
    return {
      resize(w, h) { W = w; H = h; },
      draw(t) {
        const wide = W > 760; const cx = wide ? W * 0.8 : W * 0.5, cy = wide ? H * 0.3 : H * 0.2; const sc = wide ? 1 : 0.7; const br = 1 + Math.sin(t * 1.1) * 0.04;
        glow(c, cx, cy, 120 * sc * br, COL.violet, 0.22); glow(c, cx, cy, 52 * sc * br, COL.pink, 0.35); dot(c, cx, cy, 16 * sc * br, COL.cyan, 0.55);
        layers.forEach((L, li) => {
          const k = c.ctx; k.save(); k.translate(cx, cy); k.rotate(L.rot + t * 0.02 * (li % 2 ? 1 : -1)); k.scale(1, L.tilt); k.strokeStyle = `rgba(165,139,255,${0.16 - li * 0.03})`; k.lineWidth = 1; k.setLineDash(li === 1 ? [3, 7] : []); k.beginPath(); k.arc(0, 0, L.r * sc, 0, TAU); k.stroke(); k.restore();
        });
        for (const it of items) {
          const L = layers[it.l]!; const [x, y] = P(L.r * sc, L.tilt, L.rot, it.a + t * it.sp, cx, cy); const s = it.size * sc; const k = c.ctx; k.fillStyle = `rgba(${it.col[0]},${it.col[1]},${it.col[2]},0.55)`; k.beginPath();
          if (it.shape === 0) k.arc(x, y, s, 0, TAU); else if (it.shape === 1) { k.moveTo(x, y - s * 1.3); k.lineTo(x + s * 1.1, y); k.lineTo(x, y + s * 1.3); k.lineTo(x - s * 1.1, y); k.closePath(); } else if (it.shape === 2) k.rect(x - s, y - s, s * 2, s * 2); else { k.moveTo(x, y - s * 1.2); k.lineTo(x + s * 1.2, y + s); k.lineTo(x - s * 1.2, y + s); k.closePath(); }
          k.fill(); glow(c, x, y, 14 * sc, it.col, 0.18);
        }
        const outer = layers[2]!; miles.forEach((a, i) => { const lit = Math.max(0, Math.sin(t * 0.7 - i * 1.05)); const [x, y] = P(outer.r * sc, outer.tilt, outer.rot + t * 0.02, a, cx, cy); ring(c, x, y, 5 + lit * 2, COL.gold, 0.25 + 0.5 * lit, 1.2); if (lit > 0.6) glow(c, x, y, 18, COL.gold, 0.25 * lit); });
      },
    };
  },
};
