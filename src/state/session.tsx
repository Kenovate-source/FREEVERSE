import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler, ApiError } from '../api/client';
import type { AppConfig, Me } from '../api/types';
import { navigate } from '../lib/router';

type Status = 'loading' | 'out' | 'in';
interface Ctx {
  status: Status; me: Me | null; config: AppConfig | null; perms: ReadonlySet<string>; configError: boolean; retryConnection(): Promise<void>;
  signIn(email: string, password: string): Promise<void>; signUp(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>; refresh(): Promise<Me | null>; can(p: string): boolean;
  badges: { notifications: number; messages: number }; refreshBadges(): void;
}
const C = createContext<Ctx | null>(null);
export const useSession = (): Ctx => { const v = useContext(C); if (!v) throw new Error('SessionProvider missing'); return v; };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(getToken() ? 'loading' : 'out');
  const [me, setMe] = useState<Me | null>(null); const [config, setConfig] = useState<AppConfig | null>(null); const [configError, setConfigError] = useState(false);
  const [badges, setBadges] = useState({ notifications: 0, messages: 0 });

  const refresh = useCallback(async (): Promise<Me | null> => {
    if (!getToken()) { setMe(null); setStatus('out'); return null; }
    try { const r = await api.get<{ user: Me }>('/api/me'); setMe(r.user); setStatus('in'); return r.user; }
    catch (e) { if (e instanceof ApiError && e.status === 401) { setToken(null); setMe(null); setStatus('out'); } else { setStatus((s) => (s === 'loading' ? 'out' : s)); setConfigError(true); } return null; }
  }, []);
  const loadConfig = useCallback(() => api.get<AppConfig>('/api/config').then((c) => { setConfig(c); setConfigError(false); }).catch(() => setConfigError(true)), []);
  useEffect(() => { void loadConfig(); void refresh(); }, [loadConfig, refresh]);
  useEffect(() => { setUnauthorizedHandler(() => { setToken(null); setMe(null); setStatus('out'); navigate('/signin?notice=session_expired', { replace: true }); }); return () => setUnauthorizedHandler(null); }, []);

  const refreshBadges = useCallback(() => {
    if (!getToken()) return;
    api.get<{ unreadCount: number }>('/api/notifications?unread=1&limit=1').then((r) => setBadges((b) => ({ ...b, notifications: r.unreadCount ?? 0 }))).catch(() => {});
    api.get<{ items?: { unread?: number }[] }>('/api/conversations').then((r) => setBadges((b) => ({ ...b, messages: (r.items ?? []).reduce((n, c) => n + (c.unread ?? 0), 0) }))).catch(() => {});
  }, []);
  useEffect(() => { if (status === 'in' && me?.status === 'active') { refreshBadges(); const t = setInterval(refreshBadges, 60_000); return () => clearInterval(t); } return; }, [status, me?.status, refreshBadges]);

  const perms = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const v: Ctx = useMemo(() => ({
    status, me, config, perms, configError, badges, refreshBadges, retryConnection: async () => { await loadConfig(); await refresh(); },
    async signIn(email, password) { const r = await api.post<{ session: { accessToken: string } }>('/api/auth/signin', { email, password }); setToken(r.session.accessToken); await refresh(); },
    async signUp(email, password) {
      const r = await api.post<{ needsEmailConfirmation: boolean; session: { accessToken: string } | null }>('/api/auth/signup', { email, password, confirmAgeRange: true });
      if (r.session) { setToken(r.session.accessToken); await refresh(); }
      return { needsEmailConfirmation: r.needsEmailConfirmation };
    },
    async signOut() { try { await api.post('/api/auth/signout'); } catch { /* the local session is cleared regardless */ } setToken(null); setMe(null); setStatus('out'); navigate('/', { replace: true }); },
    refresh, can: (p) => perms.has(p),
  }), [status, me, config, perms, configError, badges, refresh, refreshBadges, loadConfig]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
