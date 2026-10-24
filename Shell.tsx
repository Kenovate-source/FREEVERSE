import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { Link, navigate, usePath } from '../lib/router';
import { NAV_GROUPS, TAB_BAR, matchRoute, visibleNav, type NavItem } from '../lib/routes';
import { useSession } from '../state/session';
import { Dialog } from '../ui/kit';
import { Avatar } from '../ui/Avatar';

function NavLink({ item, current, badge, onClick }: { item: NavItem; current: boolean; badge?: number; onClick?: () => void }) {
  return (
    <Link to={item.path} aria-current={current ? 'page' : undefined} onClick={onClick}>
      <Icon name={item.icon} size={20} /><span>{item.label}</span>
      {item.soon && <span className="soon-pill">Soon</span>}
      {!!badge && <span className="count-pill" aria-label={`${badge} unread`}>{badge > 99 ? '99+' : badge}</span>}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, perms, config, signOut, badges } = useSession();
  const path = usePath(); const section = matchRoute(path)?.route.section;
  const [more, setMore] = useState(false); const [menu, setMenu] = useState(false); const [q, setQ] = useState('');
  const mainRef = useRef<HTMLElement>(null); const menuRef = useRef<HTMLDivElement>(null);
  const groups = visibleNav(perms);
  const isCurrent = (i: NavItem) => section === i.id || (i.id === 'nova' && section === 'nova') || path === i.path;
  const badgeOf = (i: NavItem) => (i.badge ? badges[i.badge] : 0);

  const firstRoute = useRef(true);
  // After a navigation, move focus to the page heading so screen-reader and keyboard users land on the new content. Not on first load, so the skip link stays the first tab stop.
  useEffect(() => { setMore(false); setMenu(false); if (firstRoute.current) { firstRoute.current = false; return; } const h = document.getElementById('page-title'); (h ?? mainRef.current)?.focus({ preventScroll: false }); window.scrollTo({ top: 0 }); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const tabs = TAB_BAR.map((id) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === id)!).filter(Boolean);
  const search = (e: React.FormEvent) => { e.preventDefault(); const v = q.trim(); if (v.length >= 2) navigate(`/search?q=${encodeURIComponent(v)}`); };
  const dev = config?.auth.kind === 'dev';

  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <aside className="sidebar" aria-label="Primary">
        <Link to="/home" className="brand"><img src="./brand/emblem-96.png" alt="" width="44" height="44" /><span className="brand-name">FREEVERSE</span></Link>
        <nav className="nav" aria-label="Main navigation">
          {groups.map((g) => (
            <div key={g.id} className="nav-group" role="group" aria-labelledby={`ng-${g.id}`}>
              <div className="nav-label" id={`ng-${g.id}`}>{g.label}</div>
              {g.items.map((i) => <NavLink key={i.id} item={i} current={isCurrent(i)} badge={badgeOf(i)} />)}
            </div>
          ))}
        </nav>
      </aside>

      <header className="topbar">
        <Link to="/home" className="brand"><img src="./brand/emblem-96.png" alt="" width="36" height="36" /><span className="brand-name">FREEVERSE</span></Link>
        <form role="search" className="topsearch" onSubmit={search}>
          <Icon name="search" size={18} /><label className="sr-only" htmlFor="gsearch">Search FREEVERSE</label>
          <input id="gsearch" type="search" placeholder="Search people, communities, learning…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
        </form>
        <div className="row" style={{ gap: 2 }}>
          <Link to="/notifications" className="icon-btn" aria-label={badges.notifications ? `Notifications, ${badges.notifications} unread` : 'Notifications'} style={{ position: 'relative' }}>
            <Icon name="bell" size={20} />{badges.notifications > 0 && <span className="dot" aria-hidden="true" />}
          </Link>
          <div className="menu-wrap" ref={menuRef}>
            <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu((v) => !v)}><Avatar size={34} name={me?.displayName ?? undefined} avatar={{ mode: 'avatar', config: { seed: me?.id ?? 'me' }, photoUrl: null }} /></button>
            {menu && (
              <div className="menu" role="menu">
                <div className="menu-head"><strong>{me?.displayName ?? 'Member'}</strong><span className="faint">{me?.handle ? `@${me.handle}` : me?.email}</span></div>
                <Link role="menuitem" to="/me/profile">My profile</Link><Link role="menuitem" to="/identities">Identities</Link><Link role="menuitem" to="/settings">Settings</Link><Link role="menuitem" to="/help">Help & safety</Link>
                <button role="menuitem" type="button" onClick={() => void signOut()}><Icon name="logout" size={16} /> Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {dev && <div className="devbar" role="note"><Icon name="alert" size={16} /> Development sign-in: accounts are local and passwords are not checked. Not for real use.</div>}
      <main id="main" className="main" ref={mainRef} tabIndex={-1}><div className="main-inner">{children}</div></main>

      <nav className="tabbar" aria-label="Quick navigation">
        {tabs.map((i) => (
          <Link key={i.id} to={i.path} aria-current={isCurrent(i) ? 'page' : undefined}><span className="tab-ico"><Icon name={i.icon} size={22} />{!!badgeOf(i) && <span className="dot" aria-hidden="true" />}</span><span>{i.label}</span></Link>
        ))}
        <button type="button" className="tab-more" onClick={() => setMore(true)} aria-haspopup="dialog"><Icon name="menu" size={22} /><span>More</span></button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="Everything in FREEVERSE">
        <nav aria-label="All sections" className="more-grid">
          {groups.map((g) => (
            <div key={g.id} className="more-group"><div className="nav-label">{g.label}</div>
              {g.items.map((i) => <NavLink key={i.id} item={i} current={isCurrent(i)} badge={badgeOf(i)} onClick={() => setMore(false)} />)}</div>
          ))}
        </nav>
      </Dialog>
    </div>
  );
}
