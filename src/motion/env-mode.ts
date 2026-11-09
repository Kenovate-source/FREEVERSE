import type { MotionDecision } from './mode';
import type { EnvMode } from '../environments/types';

/**
 * How a page environment should behave right now, from the one shared motion decision.
 *   none   Off: nothing is mounted at all (no canvas, no loop).
 *   still  one painted frame, no loop: focus zones (typing, a lesson, a game), or a device that asks for reduced motion.
 *   calm   Less: slow, sparse, low frame rate. Also what a quiet backdrop does on a focus page.
 *   full   Full: the complete environment.
 */
export function envModeFor(d: MotionDecision, o: { zones: number; focusBehaviour: 'calm' | 'still' }): EnvMode | 'none' {
  if (d.level === 'off') return 'none';
  if (o.zones > 0) return 'still';
  if (d.mode === 'focus') return o.focusBehaviour;
  if (d.level === 'less') return d.decor === 'still' ? 'still' : 'calm';
  return 'full';
}
