import { decideMotion, detectLowPower, isFocusRoute, type DecorativePref, type MotionDecision, type MotionInputs } from './mode';

// A tiny external store so React components and the lazily loaded 3D bundle read one source of truth.
type Listener = () => void;
const listeners = new Set<Listener>();
let focusZones = 0;
let routeFocus = false;
let pref: DecorativePref = 'auto';
let reduceAll = false;
let hidden = typeof document !== 'undefined' ? document.hidden : false;
let webglOverride: boolean | null = null;
let webglCache: boolean | null = null;
let current: MotionDecision | null = null;

export function webglAvailable(): boolean {
  if (webglOverride !== null) return webglOverride;
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    webglCache = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { webglCache = false; }
  return webglCache;
}
/** Test hook and a safety valve: the 3D scene calls this when it fails after the capability check passed. */
export function forceWebglUnavailable(reason?: string) { webglOverride = false; if (reason) lastError = reason; recompute(); }
export let lastError: string | null = null;

function inputs(): MotionInputs {
  const osReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = typeof matchMedia === 'function' && matchMedia('(max-width: 640px) and (pointer: coarse)').matches;
  return { osReduce, pref, reduceAll, webgl: webglAvailable(), lowPower: detectLowPower(typeof navigator !== 'undefined' ? (navigator as never) : undefined), focus: routeFocus || focusZones > 0, smallScreen };
}
function apply(d: MotionDecision) {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  r.dataset.motionMode = d.mode; r.dataset.motionLevel = d.level; r.dataset.decor = d.decor; r.dataset.quality = d.quality;
}
export function recompute() {
  const next = decideMotion(inputs());
  const changed = !current || next.mode !== current.mode || next.decor !== current.decor || next.quality !== current.quality || next.scene3d !== current.scene3d || next.drift !== current.drift || next.scrollLinked !== current.scrollLinked;
  current = next; apply(next);
  if (changed) listeners.forEach((l) => l());
}
export const getMotion = (): MotionDecision => current ?? (recompute(), current!);
export const isPageHidden = () => hidden;
export function subscribeMotion(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function setPrefs(p: { pref?: DecorativePref; reduceAll?: boolean }) { if (p.pref) pref = p.pref; if (p.reduceAll !== undefined) reduceAll = p.reduceAll; recompute(); }
export function setRouteFocus(routeId: string | null | undefined, path: string) { const f = isFocusRoute(routeId, path); if (f !== routeFocus) { routeFocus = f; recompute(); } }
/** A component that is doing focused work (composer, lesson, quiz, game, video) holds a zone while mounted. Returns a release function. */
export function holdFocusZone(): () => void { focusZones++; recompute(); let done = false; return () => { if (done) return; done = true; focusZones = Math.max(0, focusZones - 1); recompute(); }; }
export const focusZoneCount = () => focusZones;

if (typeof window !== 'undefined') {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', recompute);
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; listeners.forEach((l) => l()); });
  (window as unknown as { __fvMotion?: unknown }).__fvMotion = { get: getMotion, hidden: isPageHidden, subscribe: subscribeMotion, focusZones: focusZoneCount };
}
