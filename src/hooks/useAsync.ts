import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

/** Runs `fn` whenever `deps` change. Stale results are ignored. Supports reload and local (optimistic) data updates. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fnRef.current().then(
      (data) => { if (live) setState({ status: 'success', data }); },
      (e: unknown) => { if (live) setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) }); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const update = useCallback((fnUpdate: (prev: T) => T) => {
    setState((s) => (s.status === 'success' ? { status: 'success', data: fnUpdate(s.data) } : s));
  }, []);
  return { state, reload, update };
}
