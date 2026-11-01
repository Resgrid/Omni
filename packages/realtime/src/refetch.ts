import { logger } from '@resgrid/core/logging/logger';
import { singleFlight } from '@resgrid/core/utils/single-flight';

import { INCIDENT_COMMAND_FULL_SYNC_DEBOUNCE_MS } from './constants';
import { onRealtimeEvent, type RealtimeEventHandler, type RealtimeEventMap, type RealtimeEventName } from './event-bus';

/**
 * Refetch helpers for id-only realtime pings (omni-plan §7.5, resgrid-realtime-push skill). Every event refetch must
 * bypass caches — a cached response once showed a unit's old status for 15 minutes — and a burst of pings must cost
 * at most one request in flight plus one trailing re-run (a ping that lands mid-request may describe a change the
 * in-flight response does not include).
 */

/** Passed to every refetch. `forceRefresh` is the same instruction in @resgrid/api's `CachedRequestOptions` terms. */
export interface RealtimeRefetchContext {
  bypassCache: true;
  forceRefresh: true;
}

export const REALTIME_REFETCH_CONTEXT: Readonly<RealtimeRefetchContext> = Object.freeze({ bypassCache: true, forceRefresh: true });

export type RealtimeFetcher = (context: RealtimeRefetchContext) => Promise<unknown>;

/** A single-flight refetch with one trailing re-run; failures are logged, never thrown into event handlers. */
export function createRealtimeRefetch(fetcher: RealtimeFetcher, label = 'realtime refetch'): () => Promise<void> {
  const run = singleFlight(() => fetcher(REALTIME_REFETCH_CONTEXT));
  return async () => {
    try {
      await run();
    } catch (error) {
      logger.warn({ message: `${label} failed`, context: { error } });
    }
  };
}

/**
 * Refetches (single-flight, cache-bypassing) whenever any of `events` arrives. Returns the unsubscribe function.
 * Include the hub "joined" events (`eventingHubJoined`) to catch up after an outage — the hub replays nothing.
 */
export function subscribeRealtimeRefetch(events: readonly RealtimeEventName[], fetcher: RealtimeFetcher, label?: string): () => void {
  const refetch = createRealtimeRefetch(fetcher, label);
  const trigger = () => {
    void refetch();
  };
  const unsubscribes = events.map((event) => onRealtimeEvent(event, trigger));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

/** Per-key single flight (IC: one board refresh per incident in flight, plus one trailing re-run per incident). */
export function createKeyedRealtimeRefetch(fetcher: (key: string, context: RealtimeRefetchContext) => Promise<unknown>, label = 'realtime keyed refetch'): (key: string) => Promise<void> {
  const flights = new Map<string, { run: () => Promise<unknown>; pending: number }>();
  return async (key: string) => {
    let flight = flights.get(key);
    if (!flight) {
      flight = { run: singleFlight(() => fetcher(key, REALTIME_REFETCH_CONTEXT)), pending: 0 };
      flights.set(key, flight);
    }
    flight.pending += 1;
    try {
      await flight.run();
    } catch (error) {
      logger.warn({ message: `${label} failed`, context: { error, key } });
    } finally {
      flight.pending -= 1;
      if (flight.pending === 0 && flights.get(key) === flight) flights.delete(key);
    }
  };
}

/** Trailing debounce in front of a single-flight refetch: a burst collapses into one run after `delayMs` of quiet. */
export function createDebouncedRealtimeRefetch(fetcher: RealtimeFetcher, delayMs: number, label = 'realtime debounced refetch'): { trigger: () => void; cancel: () => void } {
  const refetch = createRealtimeRefetch(fetcher, label);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    trigger: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refetch();
      }, delayMs);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export interface IncidentCommandRefreshOptions {
  /** Refreshes one incident's command board (cache-bypassing). */
  refreshBoard: (callId: string, context: RealtimeRefetchContext) => Promise<unknown>;
  /** Full incident-command resync (IC: `/Sync/Bundle`). */
  syncAll: (context: RealtimeRefetchContext) => Promise<unknown>;
  /** Whether a board for this incident is loaded locally. */
  isTracked: (callId: string) => boolean;
  fullSyncDebounceMs?: number;
}

export interface IncidentCommandRefresh {
  /** Handler for `incidentCommandUpdated`. */
  handleIncidentCommandUpdated: RealtimeEventHandler<'incidentCommandUpdated'>;
  /** Resync everything (e.g. after `eventingHubJoined` with `rejoin`). */
  resyncAll: () => void;
  dispose: () => void;
}

/**
 * IC's coalesced board refresh: an event for a tracked incident refreshes that one board (single flight per incident
 * with a trailing re-run); an unknown or untracked incident triggers a debounced, serialized full resync.
 */
export function createIncidentCommandRefresh(options: IncidentCommandRefreshOptions): IncidentCommandRefresh {
  const refreshBoard = createKeyedRealtimeRefetch(options.refreshBoard, 'incident command board refresh');
  const fullSync = createDebouncedRealtimeRefetch(options.syncAll, options.fullSyncDebounceMs ?? INCIDENT_COMMAND_FULL_SYNC_DEBOUNCE_MS, 'incident command full sync');
  return {
    handleIncidentCommandUpdated: (callId: RealtimeEventMap['incidentCommandUpdated'][0]) => {
      if (callId && options.isTracked(callId)) void refreshBoard(callId);
      else fullSync.trigger();
    },
    resyncAll: () => fullSync.trigger(),
    dispose: () => fullSync.cancel(),
  };
}

/** Wires {@link createIncidentCommandRefresh} to the realtime events. Returns the unsubscribe function. */
export function subscribeIncidentCommandRefresh(options: IncidentCommandRefreshOptions): () => void {
  const refresh = createIncidentCommandRefresh(options);
  const offUpdated = onRealtimeEvent('incidentCommandUpdated', refresh.handleIncidentCommandUpdated);
  const offJoined = onRealtimeEvent('eventingHubJoined', (info) => {
    if (info.rejoin) refresh.resyncAll();
  });
  return () => {
    offUpdated();
    offJoined();
    refresh.dispose();
  };
}
