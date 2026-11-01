import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { isWebPlatform } from '../runtime/platform';
import { isPersonalLockEnabled, lockPersonalSession, personalLockStore, shouldLock, updateActivity } from './personal-lock-store';

/** How often the inactivity window is checked (Dispatch). */
export const INACTIVITY_CHECK_INTERVAL_MS = 30_000;

export interface InactivityMonitorOptions {
  /** Called once when the lock engages (the shell navigates to the lock screen with `replace`). */
  onLock: () => void;
  intervalMs?: number;
}

/**
 * Watches inactivity for the personal lock (Dispatch's `useInactivityLock`, as a plain function so the shell, tests and
 * the hook share it): one interval while active; on native, a resume past the timeout locks at once and other resumes
 * count as activity; the interval stops in the background. Returns the stop function.
 */
export function startInactivityMonitor({ onLock, intervalMs = INACTIVITY_CHECK_INTERVAL_MS }: InactivityMonitorOptions): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  let appState: string = AppState.currentState ?? 'active';

  const check = (): void => {
    if (shouldLock()) {
      lockPersonalSession();
      if (personalLockStore.getState().isLocked) {
        onLock();
      }
    }
  };

  const stopInterval = (): void => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const startInterval = (): void => {
    stopInterval();
    if (isPersonalLockEnabled() && !personalLockStore.getState().isLocked) {
      interval = setInterval(check, intervalMs);
    }
  };

  startInterval();

  // Web has no background/foreground lifecycle to follow (a hidden tab keeps its timers).
  const subscription = isWebPlatform()
    ? null
    : AppState.addEventListener('change', (next: AppStateStatus) => {
        const wasInactive = /inactive|background/.test(appState);
        appState = next;
        if (wasInactive && next === 'active') {
          if (shouldLock()) {
            check();
          } else {
            updateActivity();
            startInterval();
          }
        } else if (/inactive|background/.test(next)) {
          stopInterval();
        }
      });

  return () => {
    stopInterval();
    subscription?.remove();
  };
}

/** React wrapper: runs the monitor while `active` (signed in and not locked). Pass a stable `onLock`. */
export const useInactivityLock = (active: boolean, onLock: () => void): void => {
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return startInactivityMonitor({ onLock: () => onLockRef.current() });
  }, [active]);
};
