import { useEffect, useState, useCallback, useRef } from 'react';
import { healthApi } from '@/services/api/health';
import { apiClient } from '@/services/api/client';

export type ServerWarmupStatus = 'idle' | 'warming' | 'ready' | 'error';

export interface UseServerWarmupResult {
  status: ServerWarmupStatus;
  isWarming: boolean;
  isReady: boolean;
  pingServer: () => Promise<void>;
}

/**
 * useServerWarmup:
 * 1. Automatically fires an eager background ping on mount to wake up Render from inactivity.
 * 2. Listens to ApiClient for transient 502/503 cold-start retry events.
 * 3. Keeps UI updated so users understand cold starts on free-tier deployments.
 */
export function useServerWarmup(): UseServerWarmupResult {
  const [status, setStatus] = useState<ServerWarmupStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pingServer = useCallback(async () => {
    // If warming takes longer than 1.5s, signal warming state
    const warmupTimer = setTimeout(() => {
      setStatus('warming');
    }, 1500);

    try {
      await healthApi.getHealth({ retries: 2, retryDelayMs: 2500 });
      clearTimeout(warmupTimer);
      setStatus('ready');

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setStatus('idle');
      }, 3000);
    } catch {
      clearTimeout(warmupTimer);
      setStatus('error');
    }
  }, []);

  // Listen to ApiClient warming broadcasts
  useEffect(() => {
    const unsubscribe = apiClient.onWarmingChange((isWarming) => {
      if (isWarming) {
        setStatus('warming');
      } else {
        setStatus('ready');
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setStatus('idle');
        }, 3000);
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Trigger background ping once on mount
  useEffect(() => {
    void pingServer();
  }, [pingServer]);

  return {
    status,
    isWarming: status === 'warming',
    isReady: status === 'ready',
    pingServer,
  };
}

