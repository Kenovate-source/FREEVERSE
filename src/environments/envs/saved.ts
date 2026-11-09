import type { EnvDef } from '../types';
import { COL, count, glow, rgba, roundRect } from '../kit';
// SAVED: a personal archive. Three depths of collected cards drift past at different speeds; every so often one is picked out and bookmarked.
export const saved: EnvDef = {
  id: 'saved', label: 'Archive shelves', focus: 'calm',
  create(c) {
    let W = 1, H = 1; const layers = [{ y: 0.22, sp: 6, s: 0.7, a: 0.07 }, { y: 0.5, sp: 12, s: 1, a: 0.1 }, { y: 0.8, sp: 20, s: 1.3, a: 0.14 }];
    const cards = layers.flatMap((L, li) => Array.from({ length: count(c, 9) }, (_, i) => ({ li, x: (i + c.rand() * 0.5) / count(c, 9), w: (70 + c.rand() * 70) * L.s, h: (50 + c.rand() * 46) * L.s, bars: 2 + Math.floor(c.rand() * 3), hue: c.rand() < 0.5 ? COL.violet : COL.gold })));
    let pick = 0, pickAt = 2; const total = cards.length;
    return {
      resize(w, h) { W = w; H = h; },
      draw(t) {
        if (t > pickAt) { pick = Math.floor(c.rand() * total); pickAt = t + 5; }
        cards.forEach((k, idx) => {
          const L = layers[k.li]!; const span = W + 300; const x = ((k.x * span + 40 * 0 - t * L.sp) % span + span) % span - 150; const y = H * L.y - k.h / 2 + Math.sin(t * 0.3 + idx) * 3;
          const picked = idx === pick; const lift = picked ? Math.min(1, (t - (pickAt - 5)) * 1.5) * Math.max(0, Math.min(1, (pickAt - t) * 1.5)) : 0;
          const ctx = c.ctx; ctx.save(); ctx.translate(x + k.w / 2, y + k.h / 2); ctx.scale(1 + lift * 0.12, 1 + lift * 0.12); roundRect(c, -k.w / 2, -k.h / 2, k.w, k.h, 7);
          ctx.fillStyle = rgba(k.hue, L.a * 0.6 + lift * 0.1); ctx.fill(); ctx.strokeStyle = rgba(k.hue, L.a * 1.6 + lift * 0.5); ctx.lineWidth = 1; ctx.stroke();
          for (let b = 0; b < k.bars; b++) { ctx.fillStyle = rgba(COL.steel, L.a * 1.2); ctx.fillRect(-k.w / 2 + 10, -k.h / 2 + 12 + b * 9 * L.s, (k.w - 20) * (b === 0 ? 0.6 : 0.9 - b * 0.12), 2.2); }
          if (lift > 0.02) { ctx.fillStyle = rgba(COL.gold, 0.8 * lift); ctx.beginPath(); ctx.moveTo(k.w / 2 - 22, -k.h / 2); ctx.lineTo(k.w / 2 - 22, -k.h / 2 + 18); ctx.lineTo(k.w / 2 - 15, -k.h / 2 + 13); ctx.lineTo(k.w / 2 - 8, -k.h / 2 + 18); ctx.lineTo(k.w / 2 - 8, -k.h / 2); ctx.closePath(); ctx.fill(); }
          ctx.restore(); if (lift > 0.02) glow(c, x + k.w / 2, y + k.h / 2, k.w, COL.gold, 0.16 * lift);
        });
      },
    };
  },
};
