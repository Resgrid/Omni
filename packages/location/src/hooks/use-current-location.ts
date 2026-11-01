import { useSyncExternalStore } from 'react';

import { type CurrentLocation, currentLocationStore } from '../location-store';

const subscribe = (listener: () => void): (() => void) => currentLocationStore.subscribe(listener);
const getSnapshot = (): CurrentLocation | null => currentLocationStore.getState();

/**
 * The device's own latest position (watcher, task, browser or on-demand fix), or null before the first fix. Identical
 * repeated fixes do not re-render. Not persisted: after a cold start it is null until a fix arrives.
 */
export function useCurrentLocation(): CurrentLocation | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
