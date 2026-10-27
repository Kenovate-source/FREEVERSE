import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { getMotion, holdFocusZone, setPrefs, setRouteFocus, subscribeMotion } from './store';
import type { MotionDecision } from './mode';

export const useMotion = (): MotionDecision => useSyncExternalStore(subscribeMotion, getMotion, getMotion);

/** While mounted (and `active`), decorative motion is paused: use it around editors, lessons, quizzes, games and video. */
export function useFocusZone(active = true) {
  useEffect(() => { if (!active) return; return holdFocusZone(); }, [active]);
}
export function FocusZone({ active = true, children }: { active?: boolean; children?: ReactNode }) { useFocusZone(active); return <>{children}</>; }

/** Keeps the store in step with the current route. Mount once near the root. */
export function MotionRouteSync({ routeId, path }: { routeId: string | null; path: string }) {
  useEffect(() => { setRouteFocus(routeId, path); }, [routeId, path]);
  return null;
}
export { setPrefs };
