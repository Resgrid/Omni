import { useSyncExternalStore } from 'react';

import { getAppUpdatesState, subscribeAppUpdates } from './app-updates';
import type { AppUpdatesState } from './types';

/** The app-updates state for components (Settings, the shell's "Update ready" notice). Keeps its identity until it changes. */
export function useAppUpdates(): AppUpdatesState {
  return useSyncExternalStore(subscribeAppUpdates, getAppUpdatesState, getAppUpdatesState);
}
