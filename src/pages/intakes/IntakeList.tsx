import React from 'react';
import { Clock, Inbox, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { IntakeDto } from '@/services/intakeService';
import { KIND_LABELS, STATUS_BADGE, STATUS_LABELS, formatDateTime, formatWaitingFor } from './intakeFormat';

interface IntakeListProps {
  items: IntakeDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  now: number;
  emptyMessage: string;
}

export const IntakeList: React.FC<IntakeListProps> = ({
  items,
  selectedId,
  onSelect,
  isLoading,
  error,
  onRetry,
  now,
  emptyMessage,
}) => {
  if (isLoading && items.length === 0) {
    return (
      <div role="status" aria-label="Loading requests" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-3)' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width="60%" height="14px" />
            <Skeleton width="85%" height="12px" />
            <Skeleton width="40%" height="12px" />
          </div>
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div role="alert" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <AlertTriangle size={28} style={{ color: 'var(--color-warning)', marginBottom: 8 }} aria-hidden="true" />
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Could not load requests</div>
        <div style={{ fontSize: 'var(--text-xs)', marginBottom: 12 }}>{error}</div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Inbox size={32} style={{ marginBottom: 8, color: 'var(--color-brand)' }} aria-hidden="true" />
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Nothing here</div>
        <div style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <ul
      role="listbox"
      aria-label="Website requests"
      aria-activedescendant={selectedId ? `intake-option-${selectedId}` : undefined}
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}
    >
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        const isPending = item.status === 'PENDING_REVIEW';
        return (
          <li
            key={item.id}
            id={`intake-option-${item.id}`}
            role="option"
            aria-selected={isSelected}
            data-intake-id={item.id}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item.id);
              }
            }}
            style={{
              padding: 'var(--space-3)',
              borderBottom: '1px solid var(--border-subtle)',
              borderLeft: isSelected ? '3px solid var(--color-brand)' : '3px solid transparent',
              background: isSelected ? 'var(--bg-surface-subtle)' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.contact.name || 'Unnamed'}
              </span>
              <Badge variant={STATUS_BADGE[item.status] ?? 'neutral'}>{STATUS_LABELS[item.status] ?? item.status}</Badge>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {KIND_LABELS[item.kind] ?? item.kind}
              {item.request.serviceName ? ` · ${item.request.serviceName}` : ''}
              {item.address.area ? ` · ${item.address.area}` : ''}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'monospace' }}>{item.intakeNumber}</span>
              <span aria-hidden="true">·</span>
              {isPending ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={11} aria-hidden="true" />
                  waiting for {formatWaitingFor(item.createdAt, now)}
                </span>
              ) : (
                <span>{formatDateTime(item.createdAt)}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
