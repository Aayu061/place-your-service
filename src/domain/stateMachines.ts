/**
 * Place Your Service — Service Lifecycle State Machine
 * Strictly enforces valid transitions defined in DOCS/RULES.md Section 11.
 */

import { ServiceStatus } from './types';

export const ALLOWED_SERVICE_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  REQUESTED: ['PENDING', 'CANCELLED', 'ON_HOLD'],
  PENDING: ['SCHEDULED', 'CANCELLED', 'ON_HOLD'],
  SCHEDULED: ['ASSIGNED', 'CANCELLED', 'ON_HOLD'],
  ASSIGNED: ['IN_PROGRESS', 'SCHEDULED', 'CANCELLED', 'ON_HOLD'],
  IN_PROGRESS: ['AWAITING_PARTS', 'REVISIT_REQUIRED', 'RESOLVED', 'ON_HOLD'],
  AWAITING_PARTS: ['IN_PROGRESS', 'CANCELLED', 'ON_HOLD'],
  REVISIT_REQUIRED: ['SCHEDULED', 'CANCELLED', 'ON_HOLD'],
  ON_HOLD: ['REQUESTED', 'PENDING', 'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  RESOLVED: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: ['PAYMENT', 'CLOSED'],
  PAYMENT: ['CLOSED'],
  CLOSED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

/**
 * Checks whether a requested state transition is allowed by the service lifecycle rules.
 */
export function isValidServiceStatusTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_SERVICE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Returns list of allowed next statuses for a given current status.
 */
export function getAllowedNextStatuses(current: ServiceStatus): ServiceStatus[] {
  return ALLOWED_SERVICE_TRANSITIONS[current] || [];
}
