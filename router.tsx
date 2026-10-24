import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { splitHash } from './routes';

const subscribe = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
const snap = () => window.location.hash;
export function useHash(): string { return useSyncExternalStore(subscribe, snap, () => ''); }
export function usePath(): string { return splitHash(useHash()).path; }
export function useQuery(): URLSearchParams { return splitHash(useHash()).query; }

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) { window.history.replaceState(null, '', `#${path}`); window.dispatchEvent(new HashChangeEvent('hashchange')); } else window.location.hash = path;
}
/** Sets one query parameter on the current route (used by filters) without adding history entries. */
export function setQuery(patch: Record<string, string | null | undefined>) {
  const { path, query } = splitHash(window.location.hash);
  for (const [k, v] of Object.entries(patch)) { if (v) query.set(k, v); else query.delete(k); }
  const q = query.toString();
  navigate(q ? `${path}?${q}` : path, { replace: true });
}
interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> { to: string; children: ReactNode }
export function Link({ to, children, ...rest }: LinkProps) { return <a href={to.startsWith('#') ? to : `#${to}`} {...rest}>{children}</a>; }
/** Server-provided links look like “#/learn/x”. */
export const hrefToPath = (h: string) => h.replace(/^#/, '');
