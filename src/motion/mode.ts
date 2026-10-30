// FREEVERSE motion system. One pure decision function turns what we know about the person, device and page into a motion
// mode. Everything visual (CSS, the 3D scene, pointer effects) reads that mode instead of deciding for itself.
//
//   exploration  rich spatial effects and scroll-linked storytelling
//   focus        the person is reading, writing or acting: decorative motion is paused or greatly reduced
//   calm         "Less": a gentle, low-quality 3D scene with slow drift only; no scroll-linked camera or parallax
//   off          "Off" or the device asks for it: no 3D, no animation, decoration hidden
//   low          constrained device: the same story at lower quality (fewer objects, lower pixel ratio, capped frame rate)
//   fallback     WebGL (or JavaScript for the 3D bundle) is unavailable: a CSS/SVG version of the same scene
//
// Priority: off > focus > fallback > calm > low > exploration.

export type MotionMode = 'exploration' | 'focus' | 'calm' | 'off' | 'low' | 'fallback';
/** 'auto' follows the device: Off when it asks for reduced motion, Full otherwise. 'reduced' is shown to people as "Less". */
export type DecorativePref = 'auto' | 'full' | 'reduced' | 'off';
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
  /** The level the person ends up with after the device preference is applied: what they see in Settings. */
  level: 'full' | 'less' | 'off';
  /** Mount the 3D scene at all */
  scene3d: boolean;
  /** Scroll-linked storytelling (GSAP ScrollTrigger scrub) */
  scrollLinked: boolean;
  /** Pointer-driven spatial response (tilt, parallax) */
  pointer: boolean;
  /** Continuous rotation speed of the 3D scene: 0 still, ~0.3 calm, 1 full */
  drift: number;
  /** Ambient CSS decoration: 'full' animates, 'slow' animates gently, 'still' is static, 'none' hides it */
  decor: 'full' | 'slow' | 'still' | 'none';
  quality: Quality;
  /** Human-readable reason, shown in the diagnostics line of Settings */
  reason: string;
}

/** The three levels people choose between, resolved against the device preference. */
export function resolveLevel(pref: DecorativePref, osReduce: boolean, reduceAll: boolean): { level: 'full' | 'less' | 'off'; why: string } {
  if (reduceAll) return { level: 'off', why: 'Reduce motion is on in Settings' };
  if (pref === 'off') return { level: 'off', why: 'Decorative motion is off in Settings' };
  if (pref === 'reduced') return { level: 'less', why: 'Decorative motion is set to Less' };
  if (pref === 'full') return osReduce ? { level: 'less', why: 'You chose Full, but your device asks for reduced motion, so it is limited to Less' } : { level: 'full', why: 'Full experience' };
  return osReduce ? { level: 'off', why: 'Your device asks for reduced motion' } : { level: 'full', why: 'Full experience' };
}

// What each level means, so they are genuinely different (and testable):
//   Full  3D scene, scroll-linked camera, pointer parallax, continuous rotation, animated decoration.
//   Less  calm 3D scene at low quality: slow drift only, no scroll-linked camera, no parallax, slow decoration.
//         (When the device also asks for reduced motion the scene is drawn, but still.)
//   Off   no 3D, no animation or transitions, decoration hidden, content shown immediately.
export function decideMotion(i: MotionInputs): MotionDecision {
  const { level, why } = resolveLevel(i.pref, i.osReduce, i.reduceAll);
  if (level === 'off') return { mode: 'off', level, scene3d: false, scrollLinked: false, pointer: false, drift: 0, decor: 'none', quality: 'low', reason: why };
  if (i.focus) return { mode: 'focus', level, scene3d: false, scrollLinked: false, pointer: false, drift: 0, decor: 'still', quality: 'low', reason: 'Focus mode: decorative motion is paused while you read or write' };
  if (!i.webgl) return { mode: 'fallback', level, scene3d: false, scrollLinked: false, pointer: level === 'full', drift: 0, decor: level === 'full' ? 'full' : 'slow', quality: 'low', reason: 'WebGL is not available, showing the lightweight version' };
  if (level === 'less') return { mode: 'calm', level, scene3d: true, scrollLinked: false, pointer: false, drift: i.osReduce ? 0 : 0.3, decor: i.osReduce ? 'still' : 'slow', quality: 'low', reason: why };
  if (i.lowPower || i.smallScreen) return { mode: 'low', level, scene3d: true, scrollLinked: true, pointer: false, drift: 0.7, decor: 'full', quality: i.lowPower ? 'low' : 'medium', reason: i.lowPower ? 'Reduced quality for this device' : 'Lighter scene for small screens' };
  return { mode: 'exploration', level, scene3d: true, scrollLinked: true, pointer: true, drift: 1, decor: 'full', quality: 'high', reason: why };
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
