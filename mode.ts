// FREEVERSE motion system. One pure decision function turns what we know about the person, device and page into a motion
// mode. Everything visual (CSS, the 3D scene, pointer effects) reads that mode instead of deciding for itself.
//
//   exploration  rich spatial effects and scroll-linked storytelling
//   focus        the person is reading, writing or acting: decorative motion is paused or greatly reduced
//   reduced      the OS or the person asked for less motion: no scroll-linked or 3D motion, static alternatives
//   low          constrained device: the same story at lower quality (fewer objects, lower pixel ratio, capped frame rate)
//   fallback     WebGL (or JavaScript for the 3D bundle) is unavailable: a CSS/SVG version of the same scene
//
// Priority: reduced > focus > fallback > low > exploration.

export type MotionMode = 'exploration' | 'focus' | 'reduced' | 'low' | 'fallback';
export type DecorativePref = 'full' | 'reduced' | 'off';
export type Quality = 'high' | 'medium' | 'low';

export interface MotionInputs {
  /** prefers-reduced-motion: reduce */
  osReduce: boolean;
  /** Settings → Decorative motion */
  pref: DecorativePref;
  /** Settings → Reduce motion (stops all animation, including transitions) */
  reduceAll: boolean;
  /** A usable WebGL context exists */
  webgl: boolean;
  /** Constrained device: few cores, little memory, data saver */
  lowPower: boolean;
  /** The page or a component asked for focus (reading, writing, forms, policies, games) */
  focus: boolean;
  /** Small touch device: used for quality, not for disabling */
  smallScreen?: boolean;
}

export interface MotionDecision {
  mode: MotionMode;
  /** Mount the 3D scene at all */
  scene3d: boolean;
  /** Scroll-linked storytelling (GSAP ScrollTrigger scrub) */
  scrollLinked: boolean;
  /** Pointer-driven spatial response (tilt, parallax) */
  pointer: boolean;
  /** Ambient CSS decoration: 'full' animates, 'still' is static, 'none' hides it */
  decor: 'full' | 'still' | 'none';
  quality: Quality;
  /** Human-readable reason, shown in the diagnostics line of Settings */
  reason: string;
}

export function decideMotion(i: MotionInputs): MotionDecision {
  if (i.reduceAll || i.pref === 'off') return { mode: 'reduced', scene3d: false, scrollLinked: false, pointer: false, decor: 'none', quality: 'low', reason: i.reduceAll ? 'Reduce motion is on in Settings' : 'Decorative motion is off in Settings' };
  if (i.osReduce || i.pref === 'reduced') return { mode: 'reduced', scene3d: false, scrollLinked: false, pointer: false, decor: 'still', quality: 'low', reason: i.osReduce ? 'Your device asks for reduced motion' : 'Decorative motion is reduced in Settings' };
  if (i.focus) return { mode: 'focus', scene3d: false, scrollLinked: false, pointer: false, decor: 'still', quality: 'low', reason: 'Focus mode: decorative motion is paused while you read or write' };
  if (!i.webgl) return { mode: 'fallback', scene3d: false, scrollLinked: false, pointer: true, decor: 'full', quality: 'low', reason: 'WebGL is not available, showing the lightweight version' };
  if (i.lowPower || i.smallScreen) return { mode: 'low', scene3d: true, scrollLinked: true, pointer: false, decor: 'full', quality: i.lowPower ? 'low' : 'medium', reason: i.lowPower ? 'Reduced quality for this device' : 'Lighter scene for small screens' };
  return { mode: 'exploration', scene3d: true, scrollLinked: true, pointer: true, decor: 'full', quality: 'high', reason: 'Full experience' };
}

/** Routes where the task matters more than atmosphere. Everything else is exploration unless a component asks for focus. */
const FOCUS_ROUTE_IDS = new Set([
  'signin', 'signup', 'recover', 'reset-password', 'eligibility', 'onboarding',
  'terms', 'privacy', 'rules', 'trust', 'help',
  'settings', 'settings-section', 'profile-edit',
  'post', 'learn-item', 'opportunity', 'conversation', 'messages', 'nova-chat', 'journal', 'goals', 'habits', 'council-agent',
  'moderation', 'moderation-case', 'founder', 'founder-section', 'governance',
]);
export function isFocusRoute(routeId: string | null | undefined, path = ''): boolean {
  if (!routeId) return false;
  if (FOCUS_ROUTE_IDS.has(routeId)) return true;
  // Universe spaces that are tools or games are focused work; the Universe overview pages are for exploring.
  if (routeId === 'universe-space') return /\/(tools|games|play|compose|new)(\/|$)/.test(path);
  return false;
}

export function detectLowPower(nav: { hardwareConcurrency?: number; deviceMemory?: number; connection?: { saveData?: boolean } } | undefined): boolean {
  if (!nav) return false;
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return true;
  return false;
}
