import { useEffect, useRef, useState } from 'react';
import { useMotion } from '../motion/react';
import { focusZoneCount } from '../motion/store';
import { envModeFor } from '../motion/env-mode';
import type { EnvHandle, EnvironmentsApi } from '../environments/types';

let loading: Promise<EnvironmentsApi> | null = null;
/** Injects dist/environments.js once. If it can't load, the page simply has no backdrop: it is decoration, never required. */
export function loadEnvironments(): Promise<EnvironmentsApi> {
  if (window.FreeverseEnvironments) return Promise.resolve(window.FreeverseEnvironments);
  loading ??= new Promise<EnvironmentsApi>((resolve, reject) => {
    const s = document.createElement('script'); s.src = './environments.js'; s.async = true;
    s.onload = () => (window.FreeverseEnvironments ? resolve(window.FreeverseEnvironments) : reject(new Error('environments bundle did not register')));
    s.onerror = () => { loading = null; reject(new Error('environments bundle failed to load')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** The page's own environment, drawn by the central engine behind the content. Off mounts nothing. */
export function EnvironmentBackdrop({ env }: { env: string | null }) {
  const m = useMotion(); const ref = useRef<HTMLCanvasElement>(null); const handle = useRef<EnvHandle | null>(null);
  const [api, setApi] = useState<EnvironmentsApi | null>(typeof window !== 'undefined' ? window.FreeverseEnvironments ?? null : null);
  const wanted = !!env && m.level !== 'off';
  useEffect(() => { if (!wanted || api) return; let live = true; loadEnvironments().then((a) => { if (live) setApi(a); }).catch(() => undefined); return () => { live = false; }; }, [wanted, api]);
  const mode = wanted && api && env ? envModeFor(m, { zones: focusZoneCount(), focusBehaviour: api.focusBehaviour(env) }) : 'none';
  // mount once per environment; later mode changes only retune the running scene
  useEffect(() => {
    if (!api || !env || !ref.current || mode === 'none') return;
    const h = api.mount(ref.current, env, { mode, quality: m.quality }); handle.current = h; (window as unknown as { __fvEnv?: () => unknown }).__fvEnv = () => h?.stats();
    return () => { h?.dispose(); handle.current = null; };
  }, [api, env, mode === 'none', m.quality]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode !== 'none') handle.current?.setMode(mode); }, [mode]);
  useEffect(() => { if (!env || mode === 'none') return; document.documentElement.dataset.env = env; return () => { delete document.documentElement.dataset.env; }; }, [env, mode === 'none']); // eslint-disable-line react-hooks/exhaustive-deps
  if (!env || mode === 'none') return null;
  return <canvas ref={ref} className="env-backdrop" data-env-canvas={env} data-env-mode={mode} aria-hidden="true" tabIndex={-1} />;
}
