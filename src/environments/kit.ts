import type { EnvCtx } from './types';
export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => t * t * (3 - 2 * t);
export const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a).toFixed(3)})`;
/** A soft glowing dot: radial gradient, additive. */
export function glow(c: EnvCtx, x: number, y: number, r: number, col: [number, number, number], a: number) {
  const g = c.ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  c.ctx.fillStyle = g; c.ctx.beginPath(); c.ctx.arc(x, y, r, 0, TAU); c.ctx.fill();
}
export function line(c: EnvCtx, x1: number, y1: number, x2: number, y2: number, col: [number, number, number], a: number, w = 1) {
  c.ctx.strokeStyle = rgba(col, a); c.ctx.lineWidth = w; c.ctx.beginPath(); c.ctx.moveTo(x1, y1); c.ctx.lineTo(x2, y2); c.ctx.stroke();
}
export function ring(c: EnvCtx, x: number, y: number, r: number, col: [number, number, number], a: number, w = 1) {
  c.ctx.strokeStyle = rgba(col, a); c.ctx.lineWidth = w; c.ctx.beginPath(); c.ctx.arc(x, y, Math.max(0.1, r), 0, TAU); c.ctx.stroke();
}
export function dot(c: EnvCtx, x: number, y: number, r: number, col: [number, number, number], a: number) {
  c.ctx.fillStyle = rgba(col, a); c.ctx.beginPath(); c.ctx.arc(x, y, Math.max(0.1, r), 0, TAU); c.ctx.fill();
}
export function roundRect(c: EnvCtx, x: number, y: number, w: number, h: number, r: number) {
  const k = c.ctx; k.beginPath(); k.moveTo(x + r, y); k.arcTo(x + w, y, x + w, y + h, r); k.arcTo(x + w, y + h, x, y + h, r); k.arcTo(x, y + h, x, y, r); k.arcTo(x, y, x + w, y, r); k.closePath();
}
export const count = (c: EnvCtx, n: number) => Math.max(2, Math.round(n * c.density));
export const COL = {
  cyan: [62, 230, 244] as [number, number, number], blue: [79, 157, 255] as [number, number, number], violet: [165, 139, 255] as [number, number, number],
  pink: [255, 120, 190] as [number, number, number], amber: [255, 190, 90] as [number, number, number], green: [110, 235, 170] as [number, number, number],
  coral: [255, 130, 110] as [number, number, number], steel: [140, 165, 205] as [number, number, number], gold: [240, 205, 120] as [number, number, number],
};
