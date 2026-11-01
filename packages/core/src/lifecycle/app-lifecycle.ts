import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { logger } from '../logging/logger';

/**
 * App lifecycle (omni-plan §7.1, Dispatch baseline): one AppState subscription for the whole app, debounced,
 * memoized for consumers, and pinned to "active" on web/Electron. Browsers report hidden tabs and minimised
 * windows as background; reacting to that dropped every SignalR hub on Unit/IC desktop (§10.3), so web never
 * leaves "active".
 *
 * Self-contained (no zustand store): core must not import stores.
 */

export interface AppLifecycleState {
  appState: AppStateStatus;
  isActive: boolean;
  isBackground: boolean;
  /** When the app last became active (epoch ms), null until the first transition. */
  lastActiveTimestamp: number | null;
}

/** Rapid transitions (active → inactive → background on iOS) are coalesced; the latest state wins. */
export const APP_STATE_DEBOUNCE_MS = 100;

const ACTIVE_STATE: AppLifecycleState = { appState: 'active', isActive: true, isBackground: false, lastActiveTimestamp: null };

const toState = (appState: AppStateStatus, lastActiveTimestamp: number | null): AppLifecycleState => ({
  appState,
  isActive: appState === 'active',
  isBackground: appState === 'background',
  lastActiveTimestamp,
});

const APP_STATES: readonly string[] = ['active', 'background', 'inactive', 'extension', 'unknown'] satisfies AppStateStatus[];
const isAppStateStatus = (value: string): value is AppStateStatus => APP_STATES.includes(value);

const initialAppState = (): AppStateStatus => {
  if (Platform.OS === 'web') return 'active';
  try {
    // Typed as a plain string since React Native 0.88.
    const current = AppState.currentState;
    return current && isAppStateStatus(current) ? current : 'active';
  } catch {
    return 'active';
  }
};

let state: AppLifecycleState = Platform.OS === 'web' ? ACTIVE_STATE : toState(initialAppState(), null);
const listeners = new Set<() => void>();
let subscription: { remove: () => void } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: AppStateStatus | null = null;

const emit = (): void => {
  for (const listener of [...listeners]) listener();
};

const applyAppState = (next: AppStateStatus): void => {
  if (next === state.appState) return;
  logger.info({ message: 'App state changed', context: { from: state.appState, to: next } });
  state = toState(next, next === 'active' ? Date.now() : state.lastActiveTimestamp);
  emit();
};

const handleAppStateChange = (next: AppStateStatus): void => {
  // Trailing debounce: Dispatch dropped any change within 100 ms of the previous one, which could strand the app
  // in "inactive" when "background" followed quickly. Here the last state of a burst is always applied.
  pendingState = next;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const latest = pendingState;
    pendingState = null;
    if (latest) applyAppState(latest);
  }, APP_STATE_DEBOUNCE_MS);
};

/** Starts the single AppState listener (no-op on web, and when already started). Returns the stop function. */
export function startAppLifecycle(): () => void {
  if (Platform.OS === 'web') return stopAppLifecycle;
  if (!subscription) {
    state = toState(initialAppState(), state.lastActiveTimestamp);
    subscription = AppState.addEventListener('change', handleAppStateChange);
  }
  return stopAppLifecycle;
}

export function stopAppLifecycle(): void {
  subscription?.remove();
  subscription = null;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  pendingState = null;
}

export function getAppLifecycleState(): AppLifecycleState {
  return state;
}

export const isAppActive = (): boolean => state.isActive;

/** Subscribes to lifecycle changes. Returns the unsubscribe function. */
export function subscribeAppLifecycle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Current lifecycle state for components. Starts the AppState listener on first use. The returned object keeps
 * its identity until a field changes, so consumers do not re-render on unrelated writes; on web it is a constant
 * "active" object.
 */
export function useAppLifecycle(): AppLifecycleState {
  const snapshot = useSyncExternalStore(subscribeAppLifecycle, getAppLifecycleState, getAppLifecycleState);
  const { appState, isActive, isBackground, lastActiveTimestamp } = snapshot;
  useEffect(() => {
    // Idempotent; the listener is app-wide, so it is not stopped when one consumer unmounts.
    startAppLifecycle();
  }, []);
  return useMemo(() => (Platform.OS === 'web' ? ACTIVE_STATE : { appState, isActive, isBackground, lastActiveTimestamp }), [appState, isActive, isBackground, lastActiveTimestamp]);
}

/** Test helper: back to the initial state with no listener. Not for app code. */
export function resetAppLifecycleForTests(): void {
  stopAppLifecycle();
  listeners.clear();
  state = Platform.OS === 'web' ? ACTIVE_STATE : toState(initialAppState(), null);
}
