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

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
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
            {this.state.error && (
              <pre
                style={{
                  backgroundColor: 'var(--color-neutral-100)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  textAlign: 'left',
                  overflowX: 'auto',
                  marginBottom: 'var(--space-6)',
                  color: 'var(--color-neutral-800)',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <Button variant="primary" onClick={this.handleReset}>
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
