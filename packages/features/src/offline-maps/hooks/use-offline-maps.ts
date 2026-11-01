import { isOfflineMapPacksSupported, type OfflineMapsController, type OfflineMapsState } from '@resgrid/maps/offline';
import { useSyncExternalStore } from 'react';

import { getOfflineMapsController, subscribeOfflineMapsRuntime } from '../runtime';

const noopSubscribe = (): (() => void) => () => undefined;
const noState = (): null => null;

/** The configured pack manager (re-renders when the shell configures it). */
export function useOfflineMapsController(): OfflineMapsController | null {
  return useSyncExternalStore(subscribeOfflineMapsRuntime, getOfflineMapsController, getOfflineMapsController);
}

/** The manager's state, or null before the shell configured it. */
export function useOfflineMapsState(controller: OfflineMapsController | null): OfflineMapsState | null {
  return useSyncExternalStore(controller ? controller.subscribe : noopSubscribe, controller ? controller.getState : noState, controller ? controller.getState : noState);
}

/** Offline maps show only on iOS/Android and only when the department offers them. */
export const isOfflineMapsVisible = (state: OfflineMapsState | null, platformSupported: boolean = isOfflineMapPacksSupported()): boolean => platformSupported && state?.availability === 'available';
