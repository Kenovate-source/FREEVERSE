// Contract between the app bundle and the lazily loaded environments bundle (dist/environments.js).
// One central engine runs every page environment; each environment is its own module with its own composition and motion.
export type EnvMode = 'full' | 'calm' | 'still';
export type EnvQuality = 'high' | 'medium' | 'low';
export interface EnvCtx {
  ctx: CanvasRenderingContext2D;
  w: number; h: number;
  mode: EnvMode; quality: EnvQuality;
  /** 0..1 multiplier for how many things to draw: lower on weak devices and in calm mode. */
  density: number;
  /** Seeded random generator: the same environment composes the same way every time. */
  rand(): number;
}
export interface EnvScene {
  /** t: seconds since mount (scaled by mode), dt: seconds since the last frame (scaled). */
  draw(t: number, dt: number): void;
  resize(w: number, h: number): void;
}
export interface EnvDef {
  id: string;
  label: string;
  /** What to do on a "focus" page (reading, writing). Quiet backdrops stay gently alive; others hold still. */
  focus: 'calm' | 'still';
  create(c: EnvCtx): EnvScene;
}
export interface EnvHandle {
  setMode(m: EnvMode): void;
  dispose(): void;
  stats(): { env: string; mode: EnvMode; frames: number; running: boolean; visible: boolean; fps: number };
}
export interface EnvironmentsApi {
  ids: string[];
  mount(canvas: HTMLCanvasElement, id: string, o: { mode: EnvMode; quality: EnvQuality }): EnvHandle | null;
  focusBehaviour(id: string): 'calm' | 'still';
  liveCount(): number;
  version: string;
}
declare global { interface Window { FreeverseEnvironments?: EnvironmentsApi } }
