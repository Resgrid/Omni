// Stand-in for @resgrid/core in this package's tests: the real route-id check and platform detection (which read the
// mocked react-native Platform and the test's window), a silent logger, a recording router and a drivable lifecycle.
import { useSyncExternalStore } from 'react';

export { getElectronBridge, isElectron, isWeb } from '@resgrid/core/platform/platform';
export { isSafeRouteId } from '@resgrid/core/utils/route-ids';

export const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

export const routerPushWithRetry = jest.fn(async (_href: unknown, _options?: { maxAttempts?: number; retryDelayMs?: number; waitUntil?: () => boolean }) => undefined);

let active = true;
const listeners = new Set<() => void>();

const snapshot = (): { appState: 'active' | 'background'; isActive: boolean; isBackground: boolean; lastActiveTimestamp: number | null } => ({
  appState: active ? 'active' : 'background',
  isActive: active,
  isBackground: !active,
  lastActiveTimestamp: null,
});

let current = snapshot();

/** Test driver: moves the app to the foreground (true) or background (false). */
export const mockSetAppActive = (next: boolean): void => {
  if (next === active) return;
  active = next;
  current = snapshot();
  listeners.forEach((listener) => listener());
};

export const useAppLifecycle = (): ReturnType<typeof snapshot> =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current
  );
