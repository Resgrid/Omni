import { useSyncExternalStore } from 'react';

import { type LocationTransmissionStatus, transmissionStatusStore } from '../location-store';

const subscribe = (listener: () => void): (() => void) => transmissionStatusStore.subscribe(listener);
const getSnapshot = (): LocationTransmissionStatus => transmissionStatusStore.getState();

/**
 * What the transmitter is doing: target, mode (foreground watcher, background task, web, paused by permissions),
 * permissions, and the delivery trail (last fix, last queued, last acknowledged, refusals and backoff). For the
 * settings screen and the shell's location indicator.
 */
export function useLocationTransmissionStatus(): LocationTransmissionStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
