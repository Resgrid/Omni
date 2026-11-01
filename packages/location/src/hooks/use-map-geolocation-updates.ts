import type { MapMakerInfoData } from '@resgrid/models';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from 'react';

import { applyLiveLocations, changedLivePinIds, type LiveLocations, type LiveLocationState, liveLocationStore } from '../live-locations';
import { getLocationLogger } from '../logger';
import type { ObservableStore } from '../observable';

/** Unknown pins and re-join catch-ups arriving within this window share one background refetch. */
export const LIVE_LOCATION_REFRESH_DELAY_MS = 4_000;

/**
 * How often one unknown pin may ask for a refetch. The hub sends every location in the department, including entities
 * this viewer is not allowed to see — those never appear in the snapshot, and without the cooldown each of their
 * pushes would refetch the map.
 */
export const UNKNOWN_PIN_REFRESH_COOLDOWN_MS = 5 * 60_000;

export interface UseMapGeolocationUpdatesOptions {
  /** The map's full (unfiltered) pin set, the state `setPins` writes. */
  pins: MapMakerInfoData[];
  /** The map's pin setter; live moves go through a functional update that keeps the same array when nothing moved. */
  setPins: Dispatch<SetStateAction<MapMakerInfoData[]>>;
  /** Re-runs the map's REST fetch in the background without moving the camera. */
  requestRefresh?: () => void;
  /** Off for maps whose pins are owned by a parent. Default true. */
  enabled?: boolean;
  /** Defaults to the shared `liveLocationStore` (fed by @resgrid/realtime). */
  store?: ObservableStore<LiveLocationState>;
}

export interface UseMapGeolocationUpdatesResult {
  /**
   * Call with every REST result before storing it: re-applies live positions received since that fetch STARTED,
   * because a push that arrived while the request was in flight is newer than the snapshot it returned.
   */
  applyToFetchedPins: (fetchedPins: MapMakerInfoData[], fetchStartedAt: number) => MapMakerInfoData[];
}

/**
 * Moves a map's unit and personnel pins with the geolocation hub's realtime feed (IC `useMapGeolocationUpdates` +
 * Dispatch `useMapLiveLocations` options/`applyToFetchedPins` + Unit's mount-time catch-up).
 *
 * - Subscribes outside rendering: a push costs one functional `setPins`, not a re-render of the map screen.
 * - Positions already held when the map mounts predate its own snapshot and are not re-applied; only changes are.
 * - A push for a pin the snapshot does not contain never adds a pin; it asks for one coalesced background refetch,
 *   rate-limited per pin.
 * - A hub (re)join whose outage the displayed snapshot predates asks for one catch-up refetch.
 */
export function useMapGeolocationUpdates({ pins, setPins, requestRefresh, enabled = true, store = liveLocationStore }: UseMapGeolocationUpdatesOptions): UseMapGeolocationUpdatesResult {
  const pinsRef = useRef(pins);
  const requestRefreshRef = useRef(requestRefresh);
  const enabledRef = useRef(enabled);
  // Whether a REST snapshot has landed (through applyToFetchedPins); before that every push looks unknown.
  const hasLoadedRef = useRef(false);
  // When the fetch behind the displayed snapshot started.
  const snapshotStartedAtRef = useRef(0);
  // A join seen before the first snapshot landed, checked against that snapshot's start.
  const pendingJoinAtRef = useRef(0);
  const unknownRequestedAtRef = useRef(new Map<string, number>());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Positions held at first render predate the map's initial fetch, which covers them.
  const appliedRef = useRef<LiveLocations | null>(null);
  if (appliedRef.current === null) appliedRef.current = store.getState().liveLocations;
  const lastJoinAtRef = useRef<number | null>(null);
  if (lastJoinAtRef.current === null) lastJoinAtRef.current = store.getState().lastJoinAt;

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
      getLocationLogger().debug({ message: 'Refreshing map pins for realtime locations', context: { reason } });
      requestRefreshRef.current?.();
    }, LIVE_LOCATION_REFRESH_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const applyChanges = (next: LiveLocations): void => {
      const previous = appliedRef.current ?? {};
      appliedRef.current = next;
      const changed = changedLivePinIds(next, previous);
      if (changed.length === 0) return;

      setPins((current) => applyLiveLocations(current, next, { onlyPinIds: changed }).pins);

      const loaded = hasLoadedRef.current || pinsRef.current.length > 0;
      if (!loaded || !requestRefreshRef.current) return;
      const { unknownPinIds } = applyLiveLocations(pinsRef.current, next, { onlyPinIds: changed });
      if (unknownPinIds.length === 0) return;

      const now = Date.now();
      const requestedAt = unknownRequestedAtRef.current;
      const due = unknownPinIds.filter((pinId) => {
        const last = requestedAt.get(pinId);
        return last === undefined || now - last >= UNKNOWN_PIN_REFRESH_COOLDOWN_MS;
      });
      if (due.length === 0) return;
      due.forEach((pinId) => requestedAt.set(pinId, now));
      scheduleRefresh('unknown-pin');
    };

    const handleJoin = (joinedAt: number): void => {
      const previous = lastJoinAtRef.current ?? 0;
      lastJoinAtRef.current = joinedAt;
      if (joinedAt <= 0 || joinedAt === previous) return;
      if (!hasLoadedRef.current && pinsRef.current.length === 0) {
        pendingJoinAtRef.current = joinedAt;
        return;
      }
      if (snapshotStartedAtRef.current < joinedAt) scheduleRefresh('geolocation-join');
    };

    // Catch anything that changed between the first render and this subscription.
    const current = store.getState();
    applyChanges(current.liveLocations);
    handleJoin(current.lastJoinAt);

    const unsubscribe = store.subscribe((state) => {
      if (state.liveLocations !== appliedRef.current) applyChanges(state.liveLocations);
      if (state.lastJoinAt !== lastJoinAtRef.current) handleJoin(state.lastJoinAt);
    });

    return () => {
      unsubscribe();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [enabled, setPins, scheduleRefresh, store]);

  const applyToFetchedPins = useCallback(
    (fetchedPins: MapMakerInfoData[], fetchStartedAt: number): MapMakerInfoData[] => {
      if (!enabledRef.current) return fetchedPins;
      hasLoadedRef.current = true;
      snapshotStartedAtRef.current = fetchStartedAt;
      const pendingJoinAt = pendingJoinAtRef.current;
      pendingJoinAtRef.current = 0;
      if (pendingJoinAt > fetchStartedAt) scheduleRefresh('geolocation-join');
      // Only positions received after this request went out can be newer than what it returned.
      return applyLiveLocations(fetchedPins, store.getState().liveLocations, { receivedSince: fetchStartedAt }).pins;
    },
    [scheduleRefresh, store]
  );

  return { applyToFetchedPins };
}
