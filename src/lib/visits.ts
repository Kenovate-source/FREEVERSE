// Per-device visit memory behind "Continue where you left off" and "Quick access". Stored only in this browser (localStorage),
// never sent anywhere. Everything is wrapped: storage can be blocked or empty and the dashboard still renders.
const KEY = 'fv:visits:v1';
export interface Visit { path: string; title: string; count: number; last: number }
type Store = { items: Record<string, Visit>; last: Visit | null };
const SKIP = new Set(['/home', '/feed', '/', '/signin', '/signup', '/eligibility', '/onboarding', '/recover', '/reset-password']);
function read(): Store { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v && typeof v === 'object' && v.items) return v as Store; } catch { /* storage unavailable */ } return { items: {}, last: null }; }
function write(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
/** Record a visit. `fixed` is true for routes without parameters; only those count towards Quick access. */
export function recordVisit(path: string, title: string, fixed: boolean, now = Date.now()): void {
  if (SKIP.has(path) || !title) return;
  const s = read(); const v = s.items[path] ?? { path, title, count: 0, last: 0 };
  v.count += 1; v.last = now; v.title = title;
  if (fixed) s.items[path] = v;
  s.last = { ...v };
  const keys = Object.keys(s.items); if (keys.length > 40) for (const k of keys.sort((a, b) => s.items[a]!.last - s.items[b]!.last).slice(0, keys.length - 40)) delete s.items[k];
  write(s);
}
export function topVisits(n = 4): Visit[] { return Object.values(read().items).filter((v) => v.count >= 2).sort((a, b) => b.count - a.count || b.last - a.last).slice(0, n); }
export function lastVisit(): Visit | null { return read().last; }
