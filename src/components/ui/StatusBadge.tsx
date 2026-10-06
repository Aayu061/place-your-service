import React from 'react';
import { ServiceStatus, AmcStatus } from '@/domain/types';
import { formatStatusLabel } from '@/utils/formatters';

export interface StatusBadgeProps {
  status: ServiceStatus | AmcStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  let variant: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'amc' = 'neutral';
  let dotColor = 'var(--color-neutral-400)';

  switch (status) {
    case 'COMPLETED':
    case 'ACTIVE':
    case 'CLOSED':
      variant = 'success';
      dotColor = 'var(--color-success-solid)';
      break;
    case 'PENDING':
    case 'REQUESTED':
    case 'EXPIRING_SOON':
    case 'PAYMENT':
      variant = 'warning';
      dotColor = 'var(--color-warning-solid)';
      break;
    case 'CANCELLED':
    case 'EXPIRED':
      variant = 'error';
      dotColor = 'var(--color-error-solid)';
      break;
    case 'SCHEDULED':
    case 'ASSIGNED':
    case 'IN_PROGRESS':
    case 'RESOLVED':
      variant = 'info';
      dotColor = 'var(--color-info-solid)';
      break;
    case 'AWAITING_PARTS':
    case 'ON_HOLD':
    case 'REVISIT_REQUIRED':
      variant = 'amc';
      dotColor = 'var(--color-amc-solid)';
      break;
  }

  return (
    <span
      className={`badge badge-${variant} ${className}`.trim()}
      data-status={status}
    >
      <span
        className="status-dot"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      <span>{formatStatusLabel(status)}</span>
    </span>
  );
};
