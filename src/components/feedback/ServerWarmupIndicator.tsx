import React from 'react';
import { useServerWarmup } from '@/hooks/useServerWarmup';
import { Zap, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export interface ServerWarmupIndicatorProps {
  /** If inline is true, renders inside a form/container instead of fixed top-right floating */
  inline?: boolean;
}

export const ServerWarmupIndicator: React.FC<ServerWarmupIndicatorProps> = ({ inline = false }) => {
  const { status, isWarming, isReady } = useServerWarmup();

  if (status === 'idle') return null;

  const containerStyle: React.CSSProperties = inline
    ? {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        marginBottom: 'var(--space-4)',
        transition: 'all var(--transition-normal)',
      }
    : {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-full)',
        boxShadow: 'var(--shadow-lg)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
        backdropFilter: 'blur(8px)',
        transition: 'all var(--transition-normal)',
      };

  if (isWarming) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          ...containerStyle,
          backgroundColor: 'var(--color-warning-subtle, rgba(245, 158, 11, 0.12))',
          color: 'var(--color-warning, #d97706)',
          border: '1px solid var(--color-warning-subtle, rgba(245, 158, 11, 0.25))',
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        <Zap size={13} style={{ fill: 'currentColor' }} />
        <span>Server is waking up (free tier spins down when idle). Please wait ~20s...</span>
      </div>
    );
  }

  if (isReady) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          ...containerStyle,
          backgroundColor: 'var(--color-success-subtle, rgba(16, 185, 129, 0.12))',
          color: 'var(--color-success, #059669)',
          border: '1px solid var(--color-success-subtle, rgba(16, 185, 129, 0.25))',
        }}
      >
        <CheckCircle2 size={14} />
        <span>Server connected and ready</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        style={{
          ...containerStyle,
          backgroundColor: 'var(--color-danger-subtle, rgba(239, 68, 68, 0.12))',
          color: 'var(--color-danger, #dc2626)',
          border: '1px solid var(--color-danger-subtle, rgba(239, 68, 68, 0.25))',
        }}
      >
        <AlertTriangle size={14} />
        <span>Server check failed. Retrying on user action...</span>
      </div>
    );
  }

  return null;
};

