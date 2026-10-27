import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/dm-sans';
import './styles.css';
import './journey.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { SessionProvider } from './state/session';
import { ToastProvider } from './state/toast';
import { StepUpProvider } from './state/stepup';
import { A11yApplier } from './state/a11y';

import { parseAuthReturn, authReturnRoute } from './lib/auth-return';
import { setToken } from './api/client';

// Consume an email-confirmation / password-recovery return before anything reads the hash.
const authReturn = parseAuthReturn(window.location.hash);
if (authReturn) {
  if (authReturn.kind === 'session') setToken(authReturn.token);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${authReturnRoute(authReturn)}`);
}

createRoot(document.getElementById('root')!).render(
  <ToastProvider><SessionProvider><StepUpProvider><A11yApplier /><App /></StepUpProvider></SessionProvider></ToastProvider>,
);
