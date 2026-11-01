import type { OfflineMapsController } from '@resgrid/maps/offline';

/**
 * App-shell composition for Offline maps: the shell builds the pack manager (`createOfflinePackManager` from
 * `@resgrid/maps`) after `initOffline()` and hands it over with `configureOfflineMaps({ controller })`.
 */
export interface OfflineMapsRuntime {
  controller: OfflineMapsController | null;
}

let runtime: OfflineMapsRuntime = { controller: null };
const listeners = new Set<() => void>();

export function configureOfflineMaps(next: Partial<OfflineMapsRuntime>): void {
  runtime = { ...runtime, ...next };
  listeners.forEach((listener) => listener());
}

export const getOfflineMapsController = (): OfflineMapsController | null => runtime.controller;

export function subscribeOfflineMapsRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetOfflineMapsRuntimeForTests(): void {
  runtime = { controller: null };
  listeners.forEach((listener) => listener());
}
