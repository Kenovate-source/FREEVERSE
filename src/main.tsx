import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider } from './app/context';
import { App } from './app/App';

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error('FREEVERSE UI error', error, info.componentStack); }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="auth-wrap"><main id="main" className="auth-card" role="alert">
        <div className="card state state-error">
          <h1 style={{ fontSize: '1.3rem' }}>Something went wrong</h1>
          <p className="muted">The app hit an unexpected problem. Reloading usually fixes it. Your local prototype data is untouched.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </main></div>
    );
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(<StrictMode><Boundary><AppProvider><App /></AppProvider></Boundary></StrictMode>);
