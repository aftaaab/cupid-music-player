import { Component } from 'react';

/**
 * Catches render-time errors anywhere in the app.
 *
 * Without this, a single thrown error unmounts the whole React tree and the
 * user sees nothing but the black letterbox background — with no way to
 * recover except reinstalling. Now the error is shown, recorded, and the app
 * can be reloaded with one tap.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      localStorage.setItem(
        'cupid-last-crash',
        `${error?.message || error} ${(info?.componentStack || '').slice(0, 200)}`.slice(0, 500),
      );
    } catch { /* ignore */ }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isEs = (() => {
      try {
        const stored = localStorage.getItem('cupid-player-lang');
        if (stored) return stored === 'es';
        return (navigator.language || '').toLowerCase().startsWith('es');
      } catch {
        return false;
      }
    })();

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#1b1016',
          color: '#f2dbe6',
          font: '14px system-ui, sans-serif',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '28px' }}>{'\u2661'}</div>
        <div>{isEs ? 'Algo sali\u00f3 mal' : 'Something went wrong'}</div>
        <div style={{ opacity: 0.7, fontSize: '12px', wordBreak: 'break-word', maxWidth: '90%' }}>
          {String(this.state.error?.message || this.state.error)}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '8px',
            padding: '10px 20px',
            background: '#8f5fe8',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          {isEs ? 'Reiniciar' : 'Restart'}
        </button>
      </div>
    );
  }
}
