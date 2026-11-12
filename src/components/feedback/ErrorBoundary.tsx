import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Application Error Caught by ErrorBoundary]:', error, errorInfo);
  }

  private handleTryAgain = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleClearCacheAndReset = () => {
    try {
      const keys = Object.keys(window.localStorage);
      for (const k of keys) {
        if (k.startsWith('pys_') || k.startsWith('sb-')) {
          window.localStorage.removeItem(k);
        }
      }
      window.sessionStorage?.clear();
    } catch {
      // Ignore storage access errors in restricted contexts
    }
    this.setState({ hasError: false, error: null });
    window.location.assign('/');
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-6)',
            backgroundColor: 'var(--bg-app)',
          }}
        >
          <div
            className="card animate-scale-in"
            style={{
              maxWidth: '540px',
              width: '100%',
              padding: 'var(--space-8)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-danger-bg)',
                color: 'var(--color-danger-solid)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-4)',
                fontSize: '24px',
              }}
            >
              !
            </div>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>Unexpected Application Error</h2>
            <p style={{ marginBottom: 'var(--space-6)' }}>
              An unexpected error occurred while rendering this view. Your session and operational data are safe.
            </p>
            {this.state.error?.message && (
              <div
                role="alert"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  textAlign: 'left',
                  marginBottom: 'var(--space-6)',
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={this.handleTryAgain}>
                Try Again
              </Button>
              <Button variant="secondary" onClick={this.handleReload}>
                Reload Application
              </Button>
              <Button variant="outline" onClick={this.handleClearCacheAndReset}>
                Clear Local Cache &amp; Sign Out
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
