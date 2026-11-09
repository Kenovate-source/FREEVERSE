import type { EnvDef } from '../types';
import { COL, TAU, count, glow, rgba, roundRect } from '../kit';
// POSTS: a publishing environment. Drafts rise, are published at the top with a ripple, then spread; reactions burst out of the ones that land.
export const posts: EnvDef = {
  id: 'posts', label: 'Publishing', focus: 'calm',
  create(c) {
    let W = 1, H = 1; interface P { x: number; y: number; w: number; v: number; hue: [number, number, number]; pub: number; bars: number }
    const mk = (y: number): P => ({ x: c.rand(), y, w: 90 + c.rand() * 60, v: 14 + c.rand() * 16, hue: c.rand() < 0.5 ? COL.coral : COL.amber, pub: -1, bars: 2 + Math.floor(c.rand() * 2) });
    const ps = Array.from({ length: count(c, 9) }, (_, i) => mk(0.2 + i / 9)); const bursts: { x: number; y: number; born: number; hue: [number, number, number] }[] = [];
    return {
      resize(w, h) { W = w; H = h; },
      draw(t, dt) {
        for (const p of ps) {
          p.y -= (p.v * dt) / H; const px = p.x * (W - 160) + 20, py = p.y * H; const top = H * 0.16;
          if (py < top && p.pub < 0) { p.pub = t; bursts.push({ x: px + p.w / 2, y: top, born: t, hue: p.hue }); }
          if (py < -40) { Object.assign(p, mk(1.1)); continue; }
          const a = p.pub < 0 ? 0.1 : Math.max(0.02, 0.14 - (t - p.pub) * 0.06); const ctx = c.ctx; roundRect(c, px, py, p.w, 56, 8); ctx.fillStyle = rgba(p.hue, a * 0.5); ctx.fill(); ctx.strokeStyle = rgba(p.hue, a * 2); ctx.lineWidth = 1; ctx.stroke();
          for (let b = 0; b < p.bars; b++) { ctx.fillStyle = rgba(COL.steel, a * 1.6); ctx.fillRect(px + 10, py + 12 + b * 11, (p.w - 20) * (b ? 0.6 : 0.9), 3); }
          if (p.pub >= 0) { ctx.fillStyle = rgba(p.hue, 0.5 * a * 4); ctx.beginPath(); ctx.moveTo(px + p.w - 18, py + 40); ctx.lineTo(px + p.w - 10, py + 28); ctx.lineTo(px + p.w - 2, py + 40); ctx.closePath(); ctx.fill(); } // an upvote arrow once published
        }
        for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i]!; const age = t - b.born; if (age > 2.2) { bursts.splice(i, 1); continue; } const u = age / 2.2;
          for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU + b.born; const r = 8 + u * 56; glow(c, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.7 - u * 10, 5, b.hue, 0.5 * (1 - u)); } }
      },
    };
  },
};
