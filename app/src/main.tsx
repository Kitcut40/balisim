import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

/** Never leave a blank page: show the error and a reset button. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading">
        <p className="err">Erreur / Error : {this.state.error.message}</p>
        <button onClick={() => { try { localStorage.removeItem('balisim.prefs.v1'); } catch { /* ignore */ } location.reload(); }}>Recharger / Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
