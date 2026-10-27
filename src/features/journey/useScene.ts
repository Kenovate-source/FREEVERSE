import { useEffect, useRef, useState } from 'react';
import { useMotion } from '../../motion/react';
import { forceWebglUnavailable } from '../../motion/store';
import type { ImmersiveApi, SceneHandle } from '../../immersive/types';
import { identityColors, sceneNodes } from '../../lib/journey';

let loading: Promise<ImmersiveApi> | null = null;
/** Injects dist/immersive.js once. A failure (offline, blocked, old browser) rejects and the caller falls back to the CSS scene. */
export function loadImmersive(): Promise<ImmersiveApi> {
  if (window.FreeverseImmersive) return Promise.resolve(window.FreeverseImmersive);
  loading ??= new Promise<ImmersiveApi>((resolve, reject) => {
    const s = document.createElement('script'); s.src = './immersive.js'; s.async = true;
    s.onload = () => (window.FreeverseImmersive ? resolve(window.FreeverseImmersive) : reject(new Error('immersive bundle did not register')));
    s.onerror = () => { loading = null; reject(new Error('immersive bundle failed to load')); };
    document.head.appendChild(s);
  });
  return loading;
}

export type SceneState = 'off' | 'loading' | 'ready' | 'error';
/** Mounts the 3D scene when the motion decision allows it and tears it down (GSAP, listeners, WebGL) when it does not. */
export function useScene(stage: React.RefObject<HTMLElement | null>, journey: React.RefObject<HTMLElement | null>, labels: React.RefObject<Record<string, HTMLElement>>) {
  const m = useMotion(); const [state, setState] = useState<SceneState>('off'); const handle = useRef<SceneHandle | null>(null);
  useEffect(() => {
    if (!m.scene3d || !stage.current || !journey.current) { setState('off'); return; }
    let cancelled = false; setState('loading');
    // Idle-load: the page is already readable and the first paint is not delayed by 650 kB of 3D code.
    const run = () => loadImmersive().then((api) => {
      if (cancelled || !stage.current || !journey.current) return;
      handle.current = api.mount({
        stage: stage.current, journey: journey.current, nodes: sceneNodes(), identityColors: identityColors(), labels: labels.current ?? {}, quality: m.quality, scrollLinked: m.scrollLinked, pointer: m.pointer,
        onReady: () => { if (!cancelled) setState('ready'); },
        onError: (e) => { handle.current?.dispose(); handle.current = null; setState('error'); forceWebglUnavailable(e instanceof Error ? e.message : 'scene error'); },
      });
    }).catch((e) => { if (!cancelled) { setState('error'); forceWebglUnavailable(e instanceof Error ? e.message : 'load error'); } });
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(run, { timeout: 1200 }) : window.setTimeout(run, 250);
    return () => { cancelled = true; if (ric) (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(id); else clearTimeout(id); handle.current?.dispose(); handle.current = null; };
  }, [m.scene3d, m.quality, m.scrollLinked, m.pointer, stage, journey, labels]);
  return { state, setHover: (id: string | null) => handle.current?.setHover(id), handle };
}
