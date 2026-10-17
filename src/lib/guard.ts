import type { RouteMatch } from './routes';

export type GuardResult =
  | { kind: 'render'; match: RouteMatch }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

/** Decides what to show for a route given the session. Pure so it can be tested without a browser. */
export function guardRoute(match: RouteMatch | null, session: { onboarded: boolean } | null): GuardResult {
  if (!match) return { kind: 'notfound' };
  const id = match.route.id;
  if (!session) {
    return match.route.public ? { kind: 'render', match } : { kind: 'redirect', to: '/' };
  }
  const home = session.onboarded ? '/home' : '/onboarding';
  if (match.route.public) return { kind: 'redirect', to: home };
  if (!session.onboarded && id !== 'onboarding') return { kind: 'redirect', to: '/onboarding' };
  if (session.onboarded && id === 'onboarding') return { kind: 'redirect', to: '/home' };
  return { kind: 'render', match };
}
