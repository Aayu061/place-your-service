import { useEffect, useState } from 'react';
import { intakeService } from '@/services/intakeService';
import { INTAKES_CHANGED_EVENT } from '@/pages/intakes/intakeEvents';

export const PENDING_INTAKE_POLL_MS = 60_000;

/**
 * Number of website requests waiting in the Approval Inbox, for the sidebar badge.
 * Polls /intakes/stats every 60 s and fails silently (returns the last known value,
 * or null when it has never loaded).
 */
export function usePendingIntakeCount(enabled: boolean = true): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      try {
        const stats = await intakeService.stats({ quiet: true });
        if (!cancelled && typeof stats?.pending === 'number') setCount(stats.pending);
      } catch {
        // Badge is optional; keep the last value.
      }
    };

    void load();
    const id = setInterval(() => void load(), PENDING_INTAKE_POLL_MS);
    const onChanged = () => void load();
    window.addEventListener(INTAKES_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(INTAKES_CHANGED_EVENT, onChanged);
    };
  }, [enabled]);

  return count;
}
