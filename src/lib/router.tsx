import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { normalizePath } from './routes';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => normalizePath(window.location.hash), () => '/');
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) {
    window.history.replaceState(null, '', `#${path}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path;
  }
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
}
export function Link({ to, children, ...rest }: LinkProps) {
  return <a href={`#${to}`} {...rest}>{children}</a>;
}
