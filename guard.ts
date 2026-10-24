import type { RouteMatch } from './routes';

export type GuardResult = { kind: 'render'; match: RouteMatch } | { kind: 'redirect'; to: string } | { kind: 'notfound' } | { kind: 'forbidden'; match: RouteMatch };
export interface GuardSession { status: 'active' | 'pending_eligibility' | 'ineligible' | 'suspended' | string; onboarded: boolean; permissions: ReadonlySet<string> }

/** Decides what to show for a route. Pure, so it is tested without a browser. The server enforces all of this independently. */
export function guardRoute(match: RouteMatch | null, session: GuardSession | null): GuardResult {
  if (!match) return { kind: 'notfound' };
  const r = match.route;
  if (r.always) return { kind: 'render', match }; // legal pages and the password-reset return are readable in any state
  if (!session) return r.public ? { kind: 'render', match } : { kind: 'redirect', to: '/signin' };
  if (session.status === 'pending_eligibility') return r.id === 'eligibility' ? { kind: 'render', match } : { kind: 'redirect', to: '/eligibility' };
  if (session.status !== 'active') return r.id === 'landing' || r.id === 'trust' ? { kind: 'render', match } : { kind: 'redirect', to: '/' };
  if (r.eligibility) return { kind: 'redirect', to: session.onboarded ? '/home' : '/onboarding' };
  if (r.public) return r.id === 'trust' ? { kind: 'render', match } : { kind: 'redirect', to: session.onboarded ? '/home' : '/onboarding' };
  if (!session.onboarded && r.id !== 'onboarding') return { kind: 'redirect', to: '/onboarding' };
  if (session.onboarded && r.id === 'onboarding') return { kind: 'redirect', to: '/home' };
  if (r.perm && !session.permissions.has(r.perm)) return { kind: 'forbidden', match };
  return { kind: 'render', match };
}
