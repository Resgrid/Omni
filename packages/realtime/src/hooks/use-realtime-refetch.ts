import { useEffect, useRef } from 'react';

import type { RealtimeEventName } from '../event-bus';
import { type IncidentCommandRefreshOptions, type RealtimeFetcher, subscribeIncidentCommandRefresh, subscribeRealtimeRefetch } from '../refetch';

/**
 * Refetches with a single flight (one trailing re-run, `bypassCache: true`) whenever any of `events` arrives. Add a
 * hub "joined" event (`eventingHubJoined`) to catch up after an outage. The latest fetcher is always called.
 */
export function useRealtimeRefetch(events: readonly RealtimeEventName[], fetcher: RealtimeFetcher, enabled: boolean = true): void {
  const fetcherRef = useRef(fetcher);
  const eventsRef = useRef(events);
  const eventsKey = events.join('|');
  useEffect(() => {
    fetcherRef.current = fetcher;
    eventsRef.current = events;
  }, [fetcher, events]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeRealtimeRefetch(eventsRef.current, (context) => fetcherRef.current(context));
  }, [eventsKey, enabled]);
}

/** IC: coalesced per-board refresh plus a debounced full resync on `incidentCommandUpdated` (and after a rejoin). */
export function useIncidentCommandRefresh(options: IncidentCommandRefreshOptions, enabled: boolean = true): void {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeIncidentCommandRefresh({
      refreshBoard: (callId, context) => optionsRef.current.refreshBoard(callId, context),
      syncAll: (context) => optionsRef.current.syncAll(context),
      isTracked: (callId) => optionsRef.current.isTracked(callId),
      fullSyncDebounceMs: optionsRef.current.fullSyncDebounceMs,
    });
  }, [enabled]);
}
