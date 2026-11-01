import { logger } from '@resgrid/core/logging/logger';
import type { MapMakerInfoData } from '@resgrid/models';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from 'react';

import { LIVE_LOCATION_REFRESH_DELAY_MS, UNKNOWN_PIN_REFRESH_COOLDOWN_MS } from '../constants';
import { applyLiveLocations, getChangedLivePinIds, type LiveLocation, type LiveLocations } from '../live-locations';
import { useRealtimeStore } from '../realtime-store';

/** Every live position, keyed by lower-cased pin id. Re-renders on every push — maps should use `useMapLiveLocations`. */
export function useLiveLocations(): LiveLocations {
  return useRealtimeStore((state) => state.liveLocations);
}

/** One entity's live position (`u12`, `p<guid>`), or null. */
export function useLiveLocation(pinId: string): LiveLocation | null {
  return useRealtimeStore((state) => state.liveLocations[pinId.toLowerCase()] ?? null);
}

export interface UseMapLiveLocationsOptions<TPin extends MapMakerInfoData> {
  /** The map's current pins (the state `setPins` writes). */
  pins: TPin[];
  /** The map's pin state setter; live moves are applied through a functional update. */
  setPins: Dispatch<SetStateAction<TPin[]>>;
  /** Re-runs the map's REST fetch in the background, without moving the camera. */
  requestRefresh?: () => void;
  /** Off for maps whose pins are owned by a parent. */
  enabled?: boolean;
}

export interface UseMapLiveLocationsResult<TPin extends MapMakerInfoData> {
  /**
   * Call with every REST result before storing it: re-applies positions received since that fetch started, because a
   * push that arrived while the request was in flight is newer than the snapshot it returned.
   */
  applyToFetchedPins: (fetchedPins: TPin[], fetchStartedAt: number) => TPin[];
}

/**
 * Moves a map's unit and personnel pins with the geolocation hub's feed (Dispatch `use-map-live-locations`). Subscribes
 * outside React rendering, so a push costs one functional `setPins` (a no-op when nothing on this map moved). Pushes
 * for pins the map lacks ask for one coalesced background refetch, rate-limited per pin; so does a geolocation
 * re-join whose outage this map's data predates.
 */
export function useMapLiveLocations<TPin extends MapMakerInfoData>({ pins, setPins, requestRefresh, enabled = true }: UseMapLiveLocationsOptions<TPin>): UseMapLiveLocationsResult<TPin> {
  const pinsRef = useRef(pins);
  const requestRefreshRef = useRef(requestRefresh);
  const enabledRef = useRef(enabled);
  // Before the first REST snapshot every push would look like an unknown pin.
  const hasLoadedRef = useRef(false);
  const snapshotStartedAtRef = useRef(0);
  // A join acknowledged before the first snapshot landed, checked against that snapshot's start.
  const pendingJoinAtRef = useRef(0);
  const unknownRequestedAtRef = useRef(new Map<string, number>());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  useEffect(() => {
    requestRefreshRef.current = requestRefresh;
  }, [requestRefresh]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const scheduleRefresh = useCallback((reason: string) => {
    if (!requestRefreshRef.current || refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      logger.debug({ message: 'Refreshing map pins for realtime locations', context: { reason } });
      requestRefreshRef.current?.();
    }, LIVE_LOCATION_REFRESH_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleLiveLocationsChanged = (next: LiveLocations, previous: LiveLocations) => {
      const changedPinIds = getChangedLivePinIds(next, previous);
      if (changedPinIds.length === 0) return;

      setPins((currentPins) => applyLiveLocations(currentPins, next, { onlyPinIds: changedPinIds }).pins);

      if (!hasLoadedRef.current) return;
      const { unknownPinIds } = applyLiveLocations(pinsRef.current, next, { onlyPinIds: changedPinIds });
      if (unknownPinIds.length === 0) return;

      const now = Date.now();
      let shouldRefresh = false;
      unknownPinIds.forEach((pinId) => {
        const lastRequestedAt = unknownRequestedAtRef.current.get(pinId);
        if (lastRequestedAt === undefined || now - lastRequestedAt >= UNKNOWN_PIN_REFRESH_COOLDOWN_MS) {
          unknownRequestedAtRef.current.set(pinId, now);
          shouldRefresh = true;
        }
      });
      if (shouldRefresh) scheduleRefresh('unknown-pin');
    };

    // Positions pushed while the hub was away were never received: a map whose data predates the join catches up.
    const handleGeolocationJoined = (joinedAt: number) => {
      if (!hasLoadedRef.current) {
        pendingJoinAtRef.current = joinedAt;
        return;
      }
      if (snapshotStartedAtRef.current < joinedAt) scheduleRefresh('geolocation-join');
    };

    const unsubscribe = useRealtimeStore.subscribe((state, previousState) => {
      if (state.liveLocations !== previousState.liveLocations) handleLiveLocationsChanged(state.liveLocations, previousState.liveLocations);
      const joinedAt = state.hubs.geolocation.joinedAt;
      if (joinedAt !== previousState.hubs.geolocation.joinedAt && joinedAt > 0) handleGeolocationJoined(joinedAt);
    });

    return () => {
      unsubscribe();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [enabled, setPins, scheduleRefresh]);

  const applyToFetchedPins = useCallback(
    (fetchedPins: TPin[], fetchStartedAt: number): TPin[] => {
      if (!enabledRef.current) return fetchedPins;
      hasLoadedRef.current = true;
      snapshotStartedAtRef.current = fetchStartedAt;

      const pendingJoinAt = pendingJoinAtRef.current;
      pendingJoinAtRef.current = 0;
      if (pendingJoinAt > fetchStartedAt) scheduleRefresh('geolocation-join');

      // Only positions received after this request went out can be newer than what it returned.
      return applyLiveLocations(fetchedPins, useRealtimeStore.getState().liveLocations, { receivedSince: fetchStartedAt }).pins;
    },
    [scheduleRefresh]
  );

  return { applyToFetchedPins };
}
