import { describe, it, expect } from 'vitest';
import {
  isValidServiceStatusTransition,
  getAllowedNextStatuses,
} from '@/domain/stateMachines';

describe('Service Lifecycle State Machine (DOCS/RULES.md §11)', () => {
  it('allows standard forward progression through the lifecycle', () => {
    expect(isValidServiceStatusTransition('REQUESTED', 'PENDING')).toBe(true);
    expect(isValidServiceStatusTransition('PENDING', 'SCHEDULED')).toBe(true);
    expect(isValidServiceStatusTransition('SCHEDULED', 'ASSIGNED')).toBe(true);
    expect(isValidServiceStatusTransition('ASSIGNED', 'IN_PROGRESS')).toBe(true);
    expect(isValidServiceStatusTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(isValidServiceStatusTransition('RESOLVED', 'COMPLETED')).toBe(true);
    expect(isValidServiceStatusTransition('COMPLETED', 'PAYMENT')).toBe(true);
    expect(isValidServiceStatusTransition('PAYMENT', 'CLOSED')).toBe(true);
  });

  it('allows operational branching (awaiting parts, revisit, on hold)', () => {
    expect(isValidServiceStatusTransition('IN_PROGRESS', 'AWAITING_PARTS')).toBe(true);
    expect(isValidServiceStatusTransition('AWAITING_PARTS', 'IN_PROGRESS')).toBe(true);
    expect(isValidServiceStatusTransition('IN_PROGRESS', 'REVISIT_REQUIRED')).toBe(true);
    expect(isValidServiceStatusTransition('REVISIT_REQUIRED', 'SCHEDULED')).toBe(true);
    expect(isValidServiceStatusTransition('SCHEDULED', 'ON_HOLD')).toBe(true);
  });

  it('rejects arbitrary invalid state jumps', () => {
    // Skipping to completed directly
    expect(isValidServiceStatusTransition('REQUESTED', 'COMPLETED')).toBe(false);
    expect(isValidServiceStatusTransition('PENDING', 'CLOSED')).toBe(false);
    // Backward invalid jumps
    expect(isValidServiceStatusTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(isValidServiceStatusTransition('CLOSED', 'REQUESTED')).toBe(false);
  });

  it('returns empty list for terminal states', () => {
    expect(getAllowedNextStatuses('CLOSED')).toEqual([]);
    expect(getAllowedNextStatuses('CANCELLED')).toEqual([]);
  });
});
