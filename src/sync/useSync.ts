import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { syncNow } from './syncService';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'signed-out' | 'error';

const DEFAULT_INTERVAL_MS = 45_000;

/**
 * Keeps a screen's data in sync without the user doing anything: syncs once
 * on mount, again on a timer while the screen stays open, and again whenever
 * the app comes back to the foreground (AppState covers both native
 * background/foreground and, via react-native-web, browser tab
 * visibility/focus) -- covers the "left it open on my desk for an hour,
 * then picked up my phone" case that a mount-only sync misses.
 *
 * `onSynced` runs after every attempt (success or failure) so the caller can
 * reload whatever it renders from the local DB; `resyncSignal` lets a caller
 * force an extra sync outside the timer (e.g. right after saving an entry).
 */
export function usePeriodicSync(
  onSynced: () => void,
  resyncSignal: unknown = null,
  intervalMs: number = DEFAULT_INTERVAL_MS
): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const runSync = useCallback(async () => {
    setStatus('syncing');
    const result = await syncNow();
    setStatus(result.ok ? 'synced' : mapFailureReason(result.reason));
    onSyncedRef.current();
  }, []);

  useEffect(() => {
    runSync();
    const interval = setInterval(runSync, intervalMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
    // resyncSignal is intentionally in the dep list purely to trigger a rerun
    // -- eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSync, intervalMs, resyncSignal]);

  return status;
}

function mapFailureReason(reason: 'signed-out' | 'network' | 'server'): SyncStatus {
  if (reason === 'network') return 'offline';
  if (reason === 'server') return 'error';
  return 'signed-out';
}
