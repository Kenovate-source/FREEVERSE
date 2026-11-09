import type { EnvCtx, EnvDef, EnvHandle, EnvMode, EnvQuality, EnvScene } from './types';

// THE central engine. One requestAnimationFrame loop serves every mounted environment. It owns the shared concerns:
// lifecycle, frame pacing by quality and mode, pausing when the tab is hidden or the canvas is off-screen, resolution caps,
// and teardown. Environments only describe what to draw.
const FPS: Record<EnvQuality, number> = { high: 30, medium: 24, low: 18 };
const CALM_FPS = 12;
const DPR_CAP: Record<EnvQuality, number> = { high: 1.5, medium: 1.25, low: 1 };
const DENSITY: Record<EnvQuality, number> = { high: 1, medium: 0.7, low: 0.45 };
const TIME_SCALE: Record<EnvMode, number> = { full: 1, calm: 0.35, still: 0 };

function seedOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

interface Running {
  def: EnvDef; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; scene: EnvScene; c: EnvCtx;
  mode: EnvMode; quality: EnvQuality; t: number; last: number; frames: number; visible: boolean; disposed: boolean; io: IntersectionObserver; ro: ResizeObserver; fpsAvg: number; dirty: boolean;
}
const live = new Set<Running>(); let raf = 0;

function size(r: Running) {
  const w = Math.max(1, r.canvas.clientWidth || window.innerWidth), h = Math.max(1, r.canvas.clientHeight || window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP[r.quality]) * (r.mode === 'calm' ? 0.85 : 1);
  r.canvas.width = Math.round(w * dpr); r.canvas.height = Math.round(h * dpr); r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.c.w = w; r.c.h = h; r.scene.resize(w, h); r.dirty = true;
}
function paint(r: Running, dt: number) {
  r.ctx.clearRect(0, 0, r.c.w, r.c.h); r.ctx.globalCompositeOperation = 'lighter';
  r.scene.draw(r.t, dt); r.ctx.globalCompositeOperation = 'source-over'; r.frames++; r.dirty = false;
}
function wants(r: Running) { return !r.disposed && r.visible && r.mode !== 'still'; }
function loop(now: number) {
  raf = 0; if (document.hidden) { schedule(); return; }
  let any = false;
  for (const r of live) {
    if (r.dirty && r.mode === 'still') paint(r, 0);
    if (!wants(r)) { r.last = 0; continue; }
    any = true; const gap = 1000 / (r.mode === 'calm' ? CALM_FPS : FPS[r.quality]);
    if (r.last && now - r.last < gap - 1) continue;
    const dt = r.last ? Math.min(0.1, (now - r.last) / 1000) : 0; const inst = dt ? 1 / dt : 0; r.fpsAvg = r.fpsAvg ? r.fpsAvg * 0.9 + inst * 0.1 : inst; r.last = now;
    r.t += dt * TIME_SCALE[r.mode]; paint(r, dt * TIME_SCALE[r.mode]);
  }
  if (any || [...live].some((r) => r.dirty)) schedule(); // an idle engine (everything still or off-screen) costs nothing
}
function schedule() { if (!raf && live.size && !document.hidden) raf = requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { for (const r of live) { r.last = 0; r.dirty = true; } schedule(); } });

export function mountEnvironment(def: EnvDef, canvas: HTMLCanvasElement, o: { mode: EnvMode; quality: EnvQuality }): EnvHandle | null {
  const ctx = canvas.getContext('2d', { alpha: true }); if (!ctx) return null;
  const rand = mulberry(seedOf(def.id));
  const c: EnvCtx = { ctx, w: 1, h: 1, mode: o.mode, quality: o.quality, density: DENSITY[o.quality] * (o.mode === 'calm' ? 0.7 : 1), rand };
  const base = { def, canvas, ctx, c, mode: o.mode, quality: o.quality, t: 0, last: 0, frames: 0, visible: true, disposed: false, fpsAvg: 0, dirty: true } as Omit<Running, 'scene' | 'io' | 'ro'>;
  const r = base as Running;
  r.scene = def.create(c);
  r.io = new IntersectionObserver((es) => { r.visible = !!es[0]?.isIntersecting; if (r.visible) { r.last = 0; r.dirty = true; schedule(); } });
  r.ro = new ResizeObserver(() => { size(r); schedule(); });
  r.io.observe(canvas); r.ro.observe(canvas); live.add(r); size(r);
  if (o.mode === 'still') { r.t = 6; } // a still frame is drawn mid-composition, not at the empty first instant
  schedule();
  return {
    setMode(m) {
      if (r.disposed || m === r.mode) return; r.mode = m; r.c.mode = m; r.c.density = DENSITY[r.quality] * (m === 'calm' ? 0.7 : 1);
      r.scene = def.create(r.c); r.t = m === 'still' ? 6 : r.t; size(r); schedule();
    },
    dispose() { if (r.disposed) return; r.disposed = true; r.io.disconnect(); r.ro.disconnect(); live.delete(r); r.ctx.clearRect(0, 0, r.canvas.width, r.canvas.height); },
    stats() { return { env: def.id, mode: r.mode, frames: r.frames, running: wants(r) && !document.hidden, visible: r.visible, fps: Math.round(r.fpsAvg) }; },
  };
}
export const liveCount = () => live.size;
