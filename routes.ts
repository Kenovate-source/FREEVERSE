// Route table, navigation groups and path matching. Pure data + functions so they can be tested without a browser.
export type NavGroupId = 'start' | 'connect' | 'grow' | 'create' | 'ai' | 'you' | 'steward';
export interface RouteDef {
  id: string; path: string; title: string;
  /** Renders without the app shell and without a session. */
  public?: boolean;
  /** Renders for everyone in every account state (legal documents, password-reset return). */
  always?: boolean;
  /** Needs a signed-in session whose eligibility is still pending (the 18–24 step). */
  eligibility?: boolean;
  /** Needs this permission (server enforces it too; this only decides what the UI offers). */
  perm?: string;
  section?: string;
}
const R = (id: string, path: string, title: string, o: Partial<RouteDef> = {}): RouteDef => ({ id, path, title, ...o });

export const ROUTES: RouteDef[] = [
  R('landing', '/', 'FREEVERSE', { public: true }), R('trust', '/trust', 'How trust works', { public: true, always: true }),
  R('terms', '/terms', 'Terms of Service', { public: true, always: true }), R('privacy', '/privacy', 'Privacy Policy', { public: true, always: true }), R('rules', '/rules', 'Community rules', { public: true, always: true }),
  R('signin', '/signin', 'Sign in', { public: true }), R('signup', '/signup', 'Create account', { public: true }), R('recover', '/recover', 'Reset password', { public: true }), R('reset-password', '/reset-password', 'Choose a new password', { public: true, always: true }),
  R('eligibility', '/eligibility', 'Confirm eligibility', { eligibility: true }), R('onboarding', '/onboarding', 'Welcome'),
  R('home', '/home', 'Home', { section: 'home' }), R('explore', '/explore', 'Explore', { section: 'explore' }), R('search', '/search', 'Search', { section: 'explore' }),
  R('communities', '/communities', 'Communities', { section: 'communities' }), R('community', '/communities/:slug', 'Community', { section: 'communities' }),
  R('post', '/post/:id', 'Post', { section: 'home' }), R('member', '/u/:handle', 'Profile', { section: 'communities' }),
  R('messages', '/messages', 'Messages', { section: 'messages' }), R('conversation', '/messages/:id', 'Messages', { section: 'messages' }),
  R('notifications', '/notifications', 'Notifications', { section: 'notifications' }), R('saved', '/saved', 'Saved', { section: 'saved' }),
  R('learn', '/learn', 'Learn', { section: 'learn' }), R('learn-item', '/learn/:slug', 'Learn', { section: 'learn' }),
  R('opportunities', '/opportunities', 'Opportunities', { section: 'opportunities' }), R('opportunity', '/opportunities/:id', 'Opportunity', { section: 'opportunities' }),
  R('mentors', '/mentors', 'Mentors', { section: 'mentors' }), R('events', '/events', 'Events', { section: 'events' }), R('event', '/events/:id', 'Event', { section: 'events' }),
  R('nova', '/ai', 'Nova', { section: 'nova' }), R('nova-chat', '/ai/chat/:id', 'Nova', { section: 'nova' }), R('journal', '/ai/journal', 'Journal', { section: 'nova' }),
  R('goals', '/ai/goals', 'Goals', { section: 'nova' }), R('habits', '/ai/habits', 'Habits', { section: 'nova' }),
  R('council', '/ai/council', 'AI Council', { section: 'council' }), R('council-agent', '/ai/council/:agent', 'AI Council', { section: 'council' }),
  R('identities', '/identities', 'Your identities', { section: 'identities' }), R('space', '/spaces/:archetype', 'Identity space', { section: 'identities' }),
  R('profile-edit', '/me/profile', 'Your profile', { section: 'profile' }),
  R('settings', '/settings', 'Settings', { section: 'settings' }), R('settings-section', '/settings/:section', 'Settings', { section: 'settings' }),
  R('universes', '/universes', 'Universes', { section: 'universes' }), R('universe', '/universes/:id', 'Universe', { section: 'universes' }), R('universe-space', '/universes/:id/:space', 'Universe', { section: 'universes' }),
  R('soon', '/soon/:feature', 'Coming soon', { section: 'universes' }), R('help', '/help', 'Help & safety', { section: 'help' }),
  R('founder', '/founder', 'Founder Console', { perm: 'founder.console', section: 'founder' }), R('founder-section', '/founder/:section', 'Founder Console', { perm: 'founder.console', section: 'founder' }),
  R('governance', '/governance', 'Governance', { perm: 'governance.view', section: 'governance' }),
  R('moderation', '/moderation', 'Moderation', { perm: 'moderation.queue.view', section: 'moderation' }), R('moderation-case', '/moderation/:id', 'Moderation case', { perm: 'moderation.queue.view', section: 'moderation' }),
];

export interface NavItem { id: string; label: string; path: string; icon: string; soon?: boolean; perm?: string; badge?: 'notifications' | 'messages' }
export interface NavGroup { id: NavGroupId; label: string; items: NavItem[] }
export const NAV_GROUPS: NavGroup[] = [
  { id: 'start', label: 'Start', items: [{ id: 'home', label: 'Home', path: '/home', icon: 'home' }, { id: 'explore', label: 'Explore', path: '/explore', icon: 'compass' }] },
  { id: 'connect', label: 'Connect', items: [
    { id: 'communities', label: 'Communities', path: '/communities', icon: 'users' }, { id: 'messages', label: 'Messages', path: '/messages', icon: 'message', badge: 'messages' },
    { id: 'notifications', label: 'Notifications', path: '/notifications', icon: 'bell', badge: 'notifications' }, { id: 'saved', label: 'Saved', path: '/saved', icon: 'bookmark' },
    { id: 'calls', label: 'Calls', path: '/soon/calls', icon: 'phone', soon: true } ] },
  { id: 'grow', label: 'Learn & work', items: [
    { id: 'learn', label: 'Learn', path: '/learn', icon: 'learn' }, { id: 'opportunities', label: 'Opportunities', path: '/opportunities', icon: 'briefcase' },
    { id: 'mentors', label: 'Mentors', path: '/mentors', icon: 'compass2' }, { id: 'events', label: 'Events', path: '/events', icon: 'calendar' } ] },
  { id: 'create', label: 'Universes', items: [
    { id: 'u-freeconnect', label: 'FreeConnect', path: '/universes/freeconnect', icon: 'users' }, { id: 'u-freelearn', label: 'FreeLearn', path: '/universes/freelearn', icon: 'learn' }, { id: 'u-freework', label: 'FreeWork', path: '/universes/freework', icon: 'briefcase' }, { id: 'u-freebuild', label: 'FreeBuild', path: '/universes/freebuild', icon: 'layers' }, { id: 'u-freemarket', label: 'FreeMarket', path: '/universes/freemarket', icon: 'store' }, { id: 'u-freeai', label: 'FreeAI', path: '/universes/freeai', icon: 'nova' }, { id: 'u-freeresearch', label: 'FreeResearch', path: '/universes/freeresearch', icon: 'search' }, { id: 'u-freehealth', label: 'FreeHealth', path: '/universes/freehealth', icon: 'heart' }, { id: 'u-freefinance', label: 'FreeFinance', path: '/universes/freefinance', icon: 'chart' }, { id: 'u-freemedia', label: 'FreeMedia', path: '/universes/freemedia', icon: 'video' }, { id: 'u-freeevents', label: 'FreeEvents', path: '/universes/freeevents', icon: 'calendar' }, { id: 'u-freevolunteer', label: 'FreeVolunteer', path: '/universes/freevolunteer', icon: 'heart' }, { id: 'u-freelabs', label: 'FreeLabs', path: '/universes/freelabs', icon: 'target' }, { id: 'u-freeplay', label: 'FreePlay', path: '/universes/freeplay', icon: 'game' }, { id: 'u-freeentertainment', label: 'FreeEntertainment', path: '/universes/freeentertainment', icon: 'play' },
    { id: 'universes', label: 'All Universes', path: '/universes', icon: 'grid' } ] },
  { id: 'ai', label: 'AI', items: [{ id: 'nova', label: 'Nova', path: '/ai', icon: 'nova' }, { id: 'council', label: 'AI Council', path: '/ai/council', icon: 'council' }] },
  { id: 'you', label: 'You', items: [
    { id: 'profile', label: 'My profile', path: '/me/profile', icon: 'user' }, { id: 'identities', label: 'Identities', path: '/identities', icon: 'layers' },
    { id: 'settings', label: 'Settings', path: '/settings', icon: 'sliders' }, { id: 'help', label: 'Help & safety', path: '/help', icon: 'shield' } ] },
  { id: 'steward', label: 'Stewardship', items: [
    { id: 'founder', label: 'Founder Console', path: '/founder', icon: 'crown', perm: 'founder.console' }, { id: 'governance', label: 'Governance', path: '/governance', icon: 'scale', perm: 'governance.view' },
    { id: 'moderation', label: 'Moderation', path: '/moderation', icon: 'flag', perm: 'moderation.queue.view' } ] },
];
/** Five destinations on the phone tab bar; everything else is under “More”. */
export const TAB_BAR: string[] = ['home', 'explore', 'learn', 'messages'];

export interface RouteMatch { route: RouteDef; params: Record<string, string> }
export function splitHash(hash: string): { path: string; query: URLSearchParams } {
  const raw = hash.replace(/^#/, ''); const [p = '', q = ''] = raw.split('?', 2);
  let path = p.startsWith('/') ? p : '/' + p; if (path.length > 1) path = path.replace(/\/+$/, '');
  return { path, query: new URLSearchParams(q) };
}
export const normalizePath = (hash: string): string => splitHash(hash).path;

export function matchRoute(path: string): RouteMatch | null {
  const parts = path.split('/').filter(Boolean);
  for (const route of ROUTES) {
    const rparts = route.path.split('/').filter(Boolean);
    if (rparts.length !== parts.length) continue;
    const params: Record<string, string> = {}; let ok = true;
    for (let i = 0; i < rparts.length; i++) {
      const rp = rparts[i]!; const pp = parts[i]!;
      if (rp.startsWith(':')) { try { params[rp.slice(1)] = decodeURIComponent(pp); } catch { ok = false; break; } } else if (rp !== pp) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}
export const visibleNav = (perms: ReadonlySet<string>): NavGroup[] =>
  NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || perms.has(i.perm)) })).filter((g) => g.items.length);
