/** Minimal key-value storage abstraction so logic can be tested without a browser and survives blocked storage. */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

/** localStorage-backed KV. Every access is guarded: storage can throw (private windows, blocked site data). */
export function browserKV(kind: 'local' | 'session' = 'local'): KV {
  const fallback = memoryKV();
  const store = (): Storage | null => {
    try {
      return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    get(k) {
      try { return store()?.getItem(k) ?? fallback.get(k); } catch { return fallback.get(k); }
    },
    set(k, v) {
      fallback.set(k, v);
      try { store()?.setItem(k, v); } catch { /* keep in-memory copy */ }
    },
    remove(k) {
      fallback.remove(k);
      try { store()?.removeItem(k); } catch { /* ignore */ }
    },
  };
}

export function readJSON<T>(kv: KV, key: string, fallback: T): T {
  const raw = kv.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
