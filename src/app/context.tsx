import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Account, PublicUser, SimMode } from '../types';
import { browserKV, type KV } from '../lib/kv';
import { createApi, type Api } from '../data/api';
import * as auth from '../auth/mockAuth';

export function toPublicUser(a: Account): PublicUser {
  return { id: a.id, handle: a.handle, displayName: a.displayName, bio: a.bio, interests: a.interests, hue: a.hue, joinedAt: a.createdAt };
}

interface AppContextValue {
  account: Account | null;
  viewer: PublicUser | null;
  api: Api;
  mode: SimMode;
  setMode: (m: SimMode) => void;
  signUp: (input: auth.SignUpInput) => auth.AuthResult;
  signIn: (email: string, password: string) => auth.AuthResult;
  signInDemo: () => void;
  signOut: () => void;
  updateProfile: (patch: auth.ProfilePatch) => { ok: true } | { ok: false; error: string };
  resetDemoData: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);
export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

const MODE_KEY = 'fv.mock.simmode';

export function AppProvider({ children }: { children: ReactNode }) {
  const kv = useMemo<KV>(() => browserKV('local'), []);
  const sessionKv = useMemo<KV>(() => browserKV('session'), []);
  const [account, setAccount] = useState<Account | null>(() => auth.getSession(kv));
  const [mode, setModeState] = useState<SimMode>(() => {
    const raw = sessionKv.get(MODE_KEY);
    return raw === 'slow' || raw === 'error' || raw === 'empty' ? raw : 'normal';
  });

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const viewerRef = useRef<PublicUser | null>(null);
  viewerRef.current = account ? toPublicUser(account) : null;

  const api = useMemo(
    () => createApi({ kv, getMode: () => modeRef.current, getViewer: () => viewerRef.current }),
    [kv],
  );

  const setMode = useCallback((m: SimMode) => { sessionKv.set(MODE_KEY, m); setModeState(m); }, [sessionKv]);

  const value = useMemo<AppContextValue>(() => ({
    account,
    viewer: account ? toPublicUser(account) : null,
    api,
    mode,
    setMode,
    signUp(input) {
      const r = auth.signUp(kv, input);
      if (r.ok) setAccount(r.account);
      return r;
    },
    signIn(email, password) {
      const r = auth.signIn(kv, email, password);
      if (r.ok) setAccount(r.account);
      return r;
    },
    signInDemo() { setAccount(auth.signInDemo(kv)); },
    signOut() { auth.signOut(kv); setAccount(null); },
    updateProfile(patch) {
      if (!account) return { ok: false, error: 'You are not signed in.' };
      const r = auth.updateAccount(kv, account.id, patch);
      if (!r.ok) return r;
      setAccount(r.account);
      return { ok: true };
    },
    resetDemoData() { api.resetLocalState(); setModeState('normal'); sessionKv.set(MODE_KEY, 'normal'); },
  }), [account, api, mode, kv, sessionKv, setMode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
