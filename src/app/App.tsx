import { useEffect } from 'react';
import { matchRoute } from '../lib/routes';
import { guardRoute } from '../lib/guard';
import { navigate, usePath, useQuery } from '../lib/router';
import { useSession } from '../state/session';
import { Shell } from '../shell/Shell';
import { PAGES } from '../pages';
import { Loading, EmptyState, Button } from '../ui/kit';
import { Link } from '../lib/router';

export function App() {
  const { status, me, perms, configError } = useSession();
  const path = usePath(); const query = useQuery();
  const match = matchRoute(path);
  const session = status === 'in' && me ? { status: me.status, onboarded: me.onboarding.completed, permissions: perms } : null;
  const g = status === 'loading' ? null : guardRoute(match, session);
  useEffect(() => { if (g?.kind === 'redirect') navigate(g.to, { replace: true }); }, [g]);
  useEffect(() => { document.title = match ? `${match.route.title} · FREEVERSE` : 'Not found · FREEVERSE'; }, [match]);

  if (status === 'loading' || !g || g.kind === 'redirect') return <div className="auth-wrap"><Loading rows={2} label="Starting FREEVERSE" /></div>;
  if (g.kind === 'notfound') return <Chrome signedIn={!!session && me?.status === 'active' && me.onboarding.completed}><NotFound /></Chrome>;
  const Page = PAGES[g.match.route.id];
  if (g.kind === 'forbidden') return <Chrome signedIn><EmptyState icon="lock" title="That area isn’t open to your account">This part of FREEVERSE needs a role that your account doesn’t hold. Nothing is wrong; you simply don’t have access here.<Link to="/home" className="btn btn-primary">Back to Home</Link></EmptyState></Chrome>;
  if (!Page) return <Chrome signedIn={!!session}><NotFound /></Chrome>;
  const el = <Page params={g.match.params} query={query} />;
  if (g.match.route.public || g.match.route.id === 'eligibility' || g.match.route.id === 'onboarding') return <>{configError && <div className="devbar" role="alert">We couldn’t reach the FREEVERSE server. Some features may not work.</div>}{el}</>;
  return <Shell>{el}</Shell>;
}
const Chrome = ({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) => (signedIn ? <Shell>{children}</Shell> : <div className="auth-wrap">{children}</div>);
function NotFound() {
  return <EmptyState icon="compass" title="We couldn’t find that page" action={<Link to="/" className="btn btn-primary">Go to the start</Link>}>The link may be old or mistyped. Nothing was lost.</EmptyState>;
}
export { Button };
