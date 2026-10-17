import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Avatar, MockBadge } from './ui';
import { DemoControlsButton } from './DemoControls';
import { Link, usePath } from '../lib/router';
import { NAV, matchRoute, type NavId } from '../lib/routes';
import { useApp } from '../app/context';

const NAV_ICON: Record<string, IconName> = { home: 'home', learn: 'learn', opportunities: 'briefcase', events: 'calendar', nova: 'nova', messages: 'message' };

function BrandLink() {
  return (
    <Link to="/home" className="brand" aria-label="FREEVERSE home">
      <img src="./brand/emblem-96.png" alt="" width={44} height={44} />
      <span className="brand-name">FREEVERSE</span>
    </Link>
  );
}

export function Shell({ section, title, children }: { section: NavId | undefined; title: string; children: ReactNode }) {
  const { account, signOut } = useApp();
  const path = usePath();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  const [announce, setAnnounce] = useState('');

  // Accessible route changes: update the document title, move focus to the main region, announce, and reset scroll.
  useEffect(() => {
    document.title = `${title} · FREEVERSE`;
    if (first.current) { first.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    setAnnounce(`${title} page`);
  }, [path, title]);

  const bottom = NAV.filter((n) => n.id !== 'messages');
  const isCurrent = (id: NavId) => section === id;
  const activeProps = (id: NavId) => (isCurrent(id) ? ({ 'aria-current': 'page' } as const) : {});

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to main content</a>

      <aside className="sidebar">
        <BrandLink />
        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => (
            <Link key={n.id} to={n.path} {...activeProps(n.id)}>
              <Icon name={NAV_ICON[n.id] ?? 'home'} />{n.label}
            </Link>
          ))}
          <Link to="/profile" {...activeProps('profile')}><Icon name="user" />Profile</Link>
        </nav>
        <div className="sidebar-foot">
          <MockBadge label="Stage 1 prototype · mock data" />
          <DemoControlsButton />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut()}><Icon name="logout" size={18} />Sign out</button>
        </div>
      </aside>

      <header className="topbar">
        <BrandLink />
        <div className="row" style={{ gap: 4, marginLeft: 'auto' }}>
          <DemoControlsButton />
          <Link to="/messages" className="icon-btn topbar-msg-btn" aria-label="Messages" {...(isCurrent('messages') ? { 'aria-current': 'page' as const } : {})}><Icon name="message" /></Link>
          <Link to="/profile" className="icon-btn" aria-label="Your profile" {...(isCurrent('profile') ? { 'aria-current': 'page' as const } : {})}>
            <Avatar name={account?.displayName ?? '?'} hue={account?.hue ?? 0} size={34} />
          </Link>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="main" aria-labelledby="page-title">
        <div className="main-inner">{children}</div>
      </main>

      <nav className="tabbar" aria-label="Primary">
        {bottom.map((n) => (
          <Link key={n.id} to={n.path} {...activeProps(n.id)}>
            <Icon name={NAV_ICON[n.id] ?? 'home'} size={22} /><span>{n.label}</span>
          </Link>
        ))}
      </nav>

      <div role="status" aria-live="polite" className="sr-only">{announce}</div>
    </div>
  );
}

export function routeTitle(path: string): string {
  return matchRoute(path)?.route.title ?? 'Page not found';
}
