// Which page environment a route gets. Only routes with a designed environment are listed; the rest stay plain until they are designed.
// To give a page its own environment: add the file under src/environments/envs, register it in src/environments/index.ts, and map the route here.
const BY_ROUTE: Record<string, string> = {
  messages: 'messages', conversation: 'messages',
  notifications: 'notifications', saved: 'saved',
  settings: 'settings', 'settings-section': 'settings',
  'profile-edit': 'profile', member: 'profile',
  communities: 'communities', community: 'communities',
  post: 'posts',
  council: 'council', 'council-agent': 'council',
  nova: 'nova', 'nova-chat': 'nova', journal: 'nova', goals: 'nova', habits: 'nova', 'ai-preferences': 'nova',
};
export function envFor(routeId: string | null | undefined, path = ''): string | null {
  if (path.startsWith('/soon/calls')) return 'calls';
  const uv = /^\/universes\/([a-z]+)/.exec(path); if (uv) return `universe-${uv[1]}`;
  const sp = /^\/spaces\/([a-z_]+)/.exec(path); if (sp) return `space-${sp[1]}`;
  return routeId ? BY_ROUTE[routeId] ?? null : null;
}
