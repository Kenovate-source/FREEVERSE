import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/dm-sans';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { SessionProvider } from './state/session';
import { ToastProvider } from './state/toast';
import { StepUpProvider } from './state/stepup';
import { A11yApplier } from './state/a11y';

createRoot(document.getElementById('root')!).render(
  <ToastProvider><SessionProvider><StepUpProvider><A11yApplier /><App /></StepUpProvider></SessionProvider></ToastProvider>,
);
