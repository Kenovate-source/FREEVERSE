import type { EnvCtx, EnvDef, EnvScene } from '../types';
import { COL, TAU, clamp, count, dot, glow, line, ring, rgba } from '../kit';
// UNIVERSES: each Universe has its own motion metaphor, not one scene recoloured. All are quiet backdrops that never carry information the page doesn't.
type Mk = (c: EnvCtx) => EnvScene;
const def = (id: string, label: string, make: Mk): EnvDef => ({ id: `universe-${id}`, label, focus: 'calm', create: make });
const wrap = (v: number, n: number) => ((v % n) + n) % n;
const scene = (draw: (t: number, W: number, H: number) => void): EnvScene => { let W = 1, H = 1; return { resize(w, h) { W = w; H = h; }, draw(t) { draw(t, W, H); } }; };

// FREECONNECT: people-dots linked by lines; small message pulses travel between neighbours.
const freeconnect = def('freeconnect', 'Conversation network', (c) => { const n = count(c, 16); const P = Array.from({ length: n }, () => ({ x: c.rand(), y: c.rand(), p: c.rand() * TAU }));
  return scene((t, W, H) => { const pos = P.map((q) => [q.x * W + Math.sin(t * 0.2 + q.p) * 14, q.y * H + Math.cos(t * 0.17 + q.p) * 10] as const);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(pos[i]![0] - pos[j]![0], pos[i]![1] - pos[j]![1]); if (d < Math.min(W, H) * 0.34) { line(c, pos[i]![0], pos[i]![1], pos[j]![0], pos[j]![1], COL.cyan, 0.1); const u = wrap(t * 0.22 + i * 0.37 + j * 0.11, 1); if ((i + j) % 3 === 0) dot(c, pos[i]![0] + (pos[j]![0] - pos[i]![0]) * u, pos[i]![1] + (pos[j]![1] - pos[i]![1]) * u, 2.4, COL.cyan, 0.6); } }
    pos.forEach((p) => dot(c, p[0], p[1], 3.2, COL.cyan, 0.45)); }); });

// FREELEARN: stars appear one by one and join into a constellation, then it fades and a new one begins. Understanding assembling.
const freelearn = def('freelearn', 'Constellation', (c) => { const pts = Array.from({ length: 9 }, (_, i) => [0.12 + (i / 8) * 0.76 + (c.rand() - 0.5) * 0.04, 0.3 + Math.sin(i * 0.9) * 0.18 + (c.rand() - 0.5) * 0.1] as const);
  return scene((t, W, H) => { const cyc = (t % 16) / 16; const k = cyc * 11; pts.forEach((p, i) => { const a = clamp(k - i); dot(c, p[0] * W, p[1] * H, 3 + a * 1.5, COL.gold, 0.5 * a * (1 - clamp((cyc - 0.85) * 6))); if (i > 0) { const b = clamp(k - i + 0.5); line(c, pts[i - 1]![0] * W, pts[i - 1]![1] * H, pts[i - 1]![0] * W + (p[0] - pts[i - 1]![0]) * W * b, pts[i - 1]![1] * H + (p[1] - pts[i - 1]![1]) * H * b, COL.gold, 0.28 * (1 - clamp((cyc - 0.85) * 6)), 1.4); } }); }); });

// FREEWORK: opportunities arrive from the left, mentors from the right; where they meet they pair and glow.
const freework = def('freework', 'Matching', (c) => { const A = Array.from({ length: count(c, 7) }, (_, i) => ({ y: 0.18 + (i / 7) * 0.7, p: c.rand() * 6 }));
  return scene((t, W, H) => { A.forEach((a, i) => { const u = wrap(t * 0.07 + a.p, 1); const x1 = u * W * 0.5, x2 = W - u * W * 0.5; const y = a.y * H; dot(c, x1, y, 3, COL.amber, 0.5); dot(c, x2, y, 3, COL.green, 0.5); line(c, x1, y, x1 - 40, y, COL.amber, 0.12); line(c, x2, y, x2 + 40, y, COL.green, 0.12); if (u > 0.93) { glow(c, W / 2, y, 30, COL.cyan, 0.4 * (u - 0.93) / 0.07); ring(c, W / 2, y, (u - 0.93) * 500, COL.cyan, 0.3); } void i; }); }); });

// FREEAI: a luminous core with orbiting satellites; now and then a thought ring leaves the core.
const freeai = def('freeai', 'Orbits of thought', (c) => scene((t, W, H) => { const cx = W * 0.5, cy = H * 0.5, m = Math.min(W, H); glow(c, cx, cy, m * 0.12, COL.violet, 0.22); for (let i = 0; i < 4; i++) { const R = m * (0.14 + i * 0.1); ring(c, cx, cy, R, COL.violet, 0.07); const a = t * (0.3 / (1 + i * 0.5)) + i * 1.7; dot(c, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 3.5, COL.cyan, 0.55); }
  const u = (t * 0.12) % 1; ring(c, cx, cy, u * m * 0.55, COL.violet, 0.25 * (1 - u), 1.5); }));

// FREEEVENTS: a grid of days; one after another light up and a gathering ring pulses where people meet.
const freeevents = def('freeevents', 'Gathering calendar', (c) => scene((t, W, H) => { const cols = 7, rows = 4, cw = Math.min(W / (cols + 2), 70), ch = cw * 0.8, ox = (W - cols * cw) / 2, oy = H * 0.2; for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const i = r * cols + q; const on = clamp(1 - Math.abs(wrap(t * 1.1 - i, 28) - 0) * 0.4); c.ctx.fillStyle = rgba(COL.pink, 0.04 + on * 0.18); c.ctx.fillRect(ox + q * cw + 3, oy + r * ch + 3, cw - 6, ch - 6); if (on > 0.5) ring(c, ox + q * cw + cw / 2, oy + r * ch + ch / 2, (1 - on) * 60 + 6, COL.pink, 0.3 * on); } }));

// FREEBUILD: blocks drop from above and settle into a growing wall; when it is tall, it starts again.
const freebuild = def('freebuild', 'Construction', (c) => { const seq = Array.from({ length: 24 }, () => ({ w: 1 + Math.floor(c.rand() * 2) }));
  return scene((t, W, H) => { const bw = Math.min(W / 14, 54), bh = bw * 0.55, base = H * 0.86, ox = W * 0.12; const total = 22; const k = (t * 0.9) % (total + 4); let col = 0, row = 0; seq.slice(0, total).forEach((b, i) => { const a = k - i; if (a < 0) return; const x = ox + (i % 9) * bw * 1.05, y = base - Math.floor(i / 9) * bh * 1.1; const drop = a < 1 ? (1 - a) * 90 : 0; c.ctx.fillStyle = rgba(COL.amber, 0.1 + (a < 1 ? 0.1 : 0)); c.ctx.fillRect(x, y - drop, bw * b.w * 0.5 + bw * 0.5, bh); c.ctx.strokeStyle = rgba(COL.amber, 0.25); c.ctx.strokeRect(x, y - drop, bw * b.w * 0.5 + bw * 0.5, bh); void col; void row; }); }); });

// FREEMARKET: two clusters of stalls; small exchanges travel in both directions between them.
const freemarket = def('freemarket', 'Exchange', (c) => { const L = Array.from({ length: 5 }, () => [0.08 + c.rand() * 0.18, 0.2 + c.rand() * 0.6] as const), R = Array.from({ length: 5 }, () => [0.74 + c.rand() * 0.18, 0.2 + c.rand() * 0.6] as const);
  return scene((t, W, H) => { L.forEach((a, i) => { const b = R[(i * 2) % 5]!; line(c, a[0] * W, a[1] * H, b[0] * W, b[1] * H, COL.gold, 0.07); const u = wrap(t * 0.15 + i * 0.2, 1); dot(c, a[0] * W + (b[0] - a[0]) * W * u, a[1] * H + (b[1] - a[1]) * H * u, 2.6, COL.gold, 0.6); dot(c, b[0] * W + (a[0] - b[0]) * W * u, b[1] * H + (a[1] - b[1]) * H * u, 2.6, COL.green, 0.5); dot(c, a[0] * W, a[1] * H, 5, COL.gold, 0.3); dot(c, b[0] * W, b[1] * H, 5, COL.green, 0.3); }); }); });

// FREERESEARCH: a slow scanning beam sweeps a field of points; points it passes brighten and cluster lines appear.
const freeresearch = def('freeresearch', 'Survey sweep', (c) => { const P = Array.from({ length: count(c, 46) }, () => ({ x: c.rand(), y: c.rand() }));
  return scene((t, W, H) => { const sx = wrap(t * 0.07, 1.2) * W - W * 0.1; line(c, sx, 0, sx, H, COL.blue, 0.2, 2); glow(c, sx, H / 2, H * 0.4, COL.blue, 0.05); P.forEach((p) => { const d = Math.abs(p.x * W - sx); const a = clamp(1 - d / (W * 0.18)); dot(c, p.x * W, p.y * H, 2 + a * 2, COL.blue, 0.18 + a * 0.5); }); }); });

// FREEVOLUNTEER: seeds become sprouts; stems grow upward and small leaves open, then the field resets.
const freevolunteer = def('freevolunteer', 'Growing together', (c) => { const S = Array.from({ length: count(c, 9) }, () => ({ x: 0.08 + c.rand() * 0.84, p: c.rand() * 6, h: 0.18 + c.rand() * 0.22 }));
  return scene((t, W, H) => { S.forEach((s) => { const u = clamp(wrap(t * 0.06 + s.p, 1.3) / 1.0); const x = s.x * W, base = H * 0.9, top = base - s.h * H * u; line(c, x, base, x + Math.sin(t * 0.5 + s.p) * 6 * u, top, COL.green, 0.3, 2); if (u > 0.5) { const l = (u - 0.5) * 2; ring(c, x - 8 * l, top + 6, 5 * l, COL.green, 0.3); ring(c, x + 8 * l, top + 10, 5 * l, COL.pink, 0.3); } }); }); });

// FREEHEALTH: a slow breathing circle (about 10 seconds a breath) with soft halos. Calm, never urgent, not clinical.
const freehealth = def('freehealth', 'Breath', (c) => scene((t, W, H) => { const b = (Math.sin(t * (TAU / 10) - Math.PI / 2) + 1) / 2; const m = Math.min(W, H); const cx = W * 0.5, cy = H * 0.5; glow(c, cx, cy, m * (0.12 + b * 0.08), COL.green, 0.12 + b * 0.1); for (let i = 0; i < 3; i++) ring(c, cx, cy, m * (0.1 + b * 0.05 + i * 0.07), COL.green, 0.12 - i * 0.03, 1.5); void c; }));

// FREEFINANCE: bars of savings step up over time, a curve connects their tops and a marker travels along it.
const freefinance = def('freefinance', 'Compounding', (c) => scene((t, W, H) => { const n = 12, bw = (W * 0.78) / n, base = H * 0.86; const pts: [number, number][] = []; for (let i = 0; i < n; i++) { const g = clamp((t * 0.5) % (n + 3) - i, 0, 1); const h = (0.08 + Math.pow(i / n, 1.7) * 0.5) * H * g; const x = W * 0.11 + i * bw; c.ctx.fillStyle = rgba(COL.gold, 0.08 + g * 0.06); c.ctx.fillRect(x, base - h, bw * 0.7, h); pts.push([x + bw * 0.35, base - h]); } for (let i = 1; i < n; i++) line(c, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], COL.gold, 0.3, 1.5); const f = wrap(t * 0.8, n - 1); const i = Math.floor(f); const a = pts[i]!, b = pts[i + 1]!; glow(c, a[0] + (b[0] - a[0]) * (f - i), a[1] + (b[1] - a[1]) * (f - i), 14, COL.gold, 0.5); }));

// FREEMEDIA: film frames slide sideways in a strip while a soft waveform runs underneath.
const freemedia = def('freemedia', 'Film strip', (c) => scene((t, W, H) => { const fw = Math.min(W / 6, 130), fh = fw * 0.62, y = H * 0.3; for (let i = -1; i < W / (fw * 1.1) + 1; i++) { const x = wrap(i * fw * 1.1 + t * 18, W + fw * 1.1) - fw * 1.1; c.ctx.strokeStyle = rgba(COL.pink, 0.2); c.ctx.lineWidth = 1.5; c.ctx.strokeRect(x, y, fw, fh); c.ctx.fillStyle = rgba(COL.pink, 0.035 + 0.02 * Math.sin(i + t)); c.ctx.fillRect(x, y, fw, fh); }
  const k = c.ctx; k.strokeStyle = rgba(COL.violet, 0.3); k.lineWidth = 1.5; k.beginPath(); for (let x = 0; x <= W; x += 8) { const y2 = H * 0.7 + Math.sin(x * 0.02 + t * 1.4) * 14 * Math.sin(x * 0.004 + t * 0.3); x === 0 ? k.moveTo(x, y2) : k.lineTo(x, y2); } k.stroke(); }));

// FREEENTERTAINMENT: two soft spotlights sweep across a dark stage while small sparks drift up.
const freeentertainment = def('freeentertainment', 'Stage lights', (c) => { const sp = Array.from({ length: count(c, 14) }, () => ({ x: c.rand(), p: c.rand(), s: 0.02 + c.rand() * 0.03 }));
  return scene((t, W, H) => { [0, 1].forEach((i) => { const x = W * (0.5 + Math.sin(t * 0.25 + i * 2.4) * 0.38); const k = c.ctx; const g = k.createLinearGradient(x, 0, x + (i ? -W * 0.15 : W * 0.15), H); g.addColorStop(0, rgba(i ? COL.pink : COL.amber, 0.14)); g.addColorStop(1, rgba(i ? COL.pink : COL.amber, 0)); k.fillStyle = g; k.beginPath(); k.moveTo(x - 4, 0); k.lineTo(x + 4, 0); k.lineTo(x + (i ? -W * 0.15 : W * 0.15) + 60, H); k.lineTo(x + (i ? -W * 0.15 : W * 0.15) - 60, H); k.fill(); }); sp.forEach((s) => dot(c, s.x * W, H - wrap(s.p + t * s.s, 1) * H, 1.8, COL.gold, 0.45)); }); });

// FREELABS: bubbles rise through a vessel; occasionally two combine in a small flash. Experiments in progress.
const freelabs = def('freelabs', 'Reaction', (c) => { const B = Array.from({ length: count(c, 22) }, () => ({ x: 0.3 + c.rand() * 0.4, p: c.rand(), s: 0.04 + c.rand() * 0.05, r: 2 + c.rand() * 5 }));
  return scene((t, W, H) => { const vx = W * 0.3, vw = W * 0.4; line(c, vx, H * 0.15, vx, H * 0.88, COL.cyan, 0.12); line(c, vx + vw, H * 0.15, vx + vw, H * 0.88, COL.cyan, 0.12); line(c, vx, H * 0.88, vx + vw, H * 0.88, COL.cyan, 0.12); B.forEach((b) => { const u = wrap(b.p + t * b.s, 1); ring(c, b.x * W + Math.sin(t + b.p * 9) * 8, H * 0.88 - u * H * 0.7, b.r, COL.cyan, 0.3 * (1 - u * 0.5), 1.2); }); const f = (t * 0.3) % 4; if (f < 0.4) glow(c, W * 0.5, H * 0.4, 30 * (1 - f / 0.4) + 6, COL.violet, 0.5 * (1 - f / 0.4)); }); });

// FREEPLAY: a pixel grid where a bright cell travels a path and leaves a fading trail, like a game waking up.
const freeplay = def('freeplay', 'Pixel grid', (c) => scene((t, W, H) => { const S = Math.max(22, Math.min(W, H) / 16), cols = Math.ceil(W / S), rows = Math.ceil(H / S); const step = Math.floor(t * 7); const trail = 14; const pos = (n: number) => { const m = Math.max(2, cols - 4); const x = 2 + (n % (m * 2)) % m; const dir = Math.floor(n / m) % 2; const row = 2 + (Math.floor(n / (m * 1)) * 3) % Math.max(3, rows - 4); return [dir ? 2 + m - 1 - (n % m) : x, row] as const; };
  c.ctx.fillStyle = rgba(COL.cyan, 0.03); for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) if ((q + r) % 2 === 0) c.ctx.fillRect(q * S + 2, r * S + 2, S - 4, S - 4);
  for (let k = 0; k < trail; k++) { const [x, y] = pos(step - k); c.ctx.fillStyle = rgba(k === 0 ? COL.gold : COL.cyan, (k === 0 ? 0.55 : 0.28) * (1 - k / trail)); c.ctx.fillRect(x * S + 2, y * S + 2, S - 4, S - 4); } }));

export const UNIVERSE_ENVS: EnvDef[] = [freeconnect, freelearn, freework, freeai, freeevents, freebuild, freemarket, freeresearch, freevolunteer, freehealth, freefinance, freemedia, freeentertainment, freelabs, freeplay];
