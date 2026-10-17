import { useEffect, type ReactNode } from 'react';
import { useApp } from './context';
import { navigate, usePath } from '../lib/router';
import { matchRoute } from '../lib/routes';
import { guardRoute } from '../lib/guard';
import { Shell } from '../components/Shell';
import { Welcome, SignIn, SignUp } from '../pages/auth';
import { Onboarding } from '../pages/Onboarding';
import { Home } from '../pages/Home';
import { Learn, LearnItemPage } from '../pages/Learn';
import { Opportunities, Mentors } from '../pages/Opportunities';
import { Events } from '../pages/Events';
import { Nova } from '../pages/Nova';
import { Messages } from '../pages/Messages';
import { MyProfile, UserProfile } from '../pages/Profile';
import { NotFound } from '../pages/NotFound';

export function App() {
  const path = usePath();
  const { account } = useApp();
  const match = matchRoute(path);
  const g = guardRoute(match, account);

  useEffect(() => {
    if (g.kind === 'redirect') navigate(g.to, { replace: true });
  }, [g.kind === 'redirect' ? g.to : '', g.kind]);

  useEffect(() => {
    if (g.kind === 'render' && (g.match.route.public || g.match.route.id === 'onboarding')) document.title = `${g.match.route.title} · FREEVERSE`;
  }, [g]);

  if (g.kind === 'redirect') return null;
  if (g.kind === 'notfound') {
    return account
      ? <Shell section={undefined} title="Page not found"><NotFound /></Shell>
      : <div className="auth-wrap"><main id="main" className="auth-card"><NotFound /></main></div>;
  }

  const { route, params } = g.match;
  let page: ReactNode;
  switch (route.id) {
    case 'welcome': return <Welcome />;
    case 'signin': return <SignIn />;
    case 'signup': return <SignUp />;
    case 'onboarding': return <Onboarding />;
    case 'home': page = <Home />; break;
    case 'learn': page = <Learn />; break;
    case 'learn-item': page = <LearnItemPage id={params.id ?? ''} />; break;
    case 'opportunities': page = <Opportunities />; break;
    case 'mentors': page = <Mentors />; break;
    case 'events': page = <Events />; break;
    case 'nova': page = <Nova />; break;
    case 'messages': page = <Messages />; break;
    case 'profile': page = <MyProfile />; break;
    case 'user': page = <UserProfile handle={params.handle ?? ''} />; break;
  }
  return <Shell section={route.section} title={route.title}>{page}</Shell>;
}
