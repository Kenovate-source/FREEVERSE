export type RouteId =
  | 'welcome' | 'signin' | 'signup' | 'onboarding'
  | 'home' | 'learn' | 'learn-item' | 'opportunities' | 'mentors' | 'events' | 'nova' | 'messages'
  | 'profile' | 'user';

export interface RouteDef {
  id: RouteId;
  path: string;
  /** Public routes render without the app shell and without a session. */
  public?: boolean;
  /** Section highlighted in navigation. */
  section?: NavId;
  title: string;
}

export type NavId = 'home' | 'learn' | 'opportunities' | 'events' | 'nova' | 'messages' | 'profile';

export const ROUTES: RouteDef[] = [
  { id: 'welcome', path: '/', public: true, title: 'Welcome' },
  { id: 'signin', path: '/signin', public: true, title: 'Sign in' },
  { id: 'signup', path: '/signup', public: true, title: 'Create account' },
  { id: 'onboarding', path: '/onboarding', title: 'Welcome to FREEVERSE' },
  { id: 'home', path: '/home', section: 'home', title: 'Home' },
  { id: 'learn', path: '/learn', section: 'learn', title: 'Learn' },
  { id: 'learn-item', path: '/learn/:id', section: 'learn', title: 'Learn' },
  { id: 'opportunities', path: '/opportunities', section: 'opportunities', title: 'Opportunities' },
  { id: 'mentors', path: '/opportunities/mentors', section: 'opportunities', title: 'Mentors' },
  { id: 'events', path: '/events', section: 'events', title: 'Events' },
  { id: 'nova', path: '/nova', section: 'nova', title: 'Nova' },
  { id: 'messages', path: '/messages', section: 'messages', title: 'Messages' },
  { id: 'profile', path: '/profile', section: 'profile', title: 'Your profile' },
  { id: 'user', path: '/u/:handle', section: 'home', title: 'Profile' },
];

/** The principal navigation destinations. Each must resolve to a real route (enforced by tests). */
export const NAV: { id: NavId; label: string; path: string }[] = [
  { id: 'home', label: 'Home', path: '/home' },
  { id: 'learn', label: 'Learn', path: '/learn' },
  { id: 'opportunities', label: 'Opportunities', path: '/opportunities' },
  { id: 'events', label: 'Events', path: '/events' },
  { id: 'nova', label: 'Nova', path: '/nova' },
  { id: 'messages', label: 'Messages', path: '/messages' },
];

export interface RouteMatch {
  route: RouteDef;
  params: Record<string, string>;
}

export function normalizePath(hash: string): string {
  let p = hash.replace(/^#/, '');
  p = p.split('?')[0] ?? '';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

export function matchRoute(path: string): RouteMatch | null {
  const parts = path.split('/').filter(Boolean);
  for (const route of ROUTES) {
    const rparts = route.path.split('/').filter(Boolean);
    if (rparts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rparts.length; i++) {
      const rp = rparts[i]!;
      const pp = parts[i]!;
      if (rp.startsWith(':')) {
        try { params[rp.slice(1)] = decodeURIComponent(pp); } catch { ok = false; break; }
      } else if (rp !== pp) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}
