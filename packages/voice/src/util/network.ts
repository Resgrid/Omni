import { getVoiceRuntime } from '../runtime';

export type NetworkEvent = 'online' | 'network_change';

/** Online unless the injected connectivity says otherwise (no source = assume online and let the backoff decide). */
export const isVoiceOnline = (): boolean => getVoiceRuntime().connectivity?.isOnline() ?? true;

/**
 * Calls `listener` when the device comes back online or moves to another network while online (Wi-Fi ↔ cellular): the
 * moments a dropped voice channel or audio stream should reconnect at once rather than wait out its backoff. Returns an
 * unsubscribe function (a no-op without an injected connectivity source).
 */
export function subscribeNetworkEvents(listener: (event: NetworkEvent) => void): () => void {
  const connectivity = getVoiceRuntime().connectivity;

  if (!connectivity) return () => undefined;

  const offOnline = connectivity.subscribe((online) => {
    if (online) listener('online');
  });

  const offChange = connectivity.subscribeNetworkChange?.(() => listener('network_change')) ?? (() => undefined);

  return () => {
    offOnline();
    offChange();
  };
}

/** Backoff for reconnect attempt `attempt` (0-based): the first tries come quickly (a handover drops for a second), then ease off. */
export const reconnectDelayMs = (attempt: number, delays: readonly number[]): number => delays[Math.min(Math.max(attempt, 0), delays.length - 1)] ?? 0;
