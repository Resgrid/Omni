import { useMapMarkersStore } from '@resgrid/data';
import type { MapMakerInfoData } from '@resgrid/models';
import { type RealtimeEventName, useMapLiveLocations, useRealtimeRefetch } from '@resgrid/realtime';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Pushes that change what the department map shows (id-only pings: refetch bypassing caches); the join catches up after an outage. */
export const MAP_REFRESH_EVENTS: readonly RealtimeEventName[] = ['callsUpdated', 'callAdded', 'callClosed', 'unitStatusUpdated', 'personnelStatusUpdated', 'eventingHubJoined'];

export interface LiveMapPins {
  pins: MapMakerInfoData[];
  /** True once a snapshot exists (fetched now or persisted from an earlier session). */
  hasLoaded: boolean;
  isLoading: boolean;
  hasError: boolean;
  centerLatitude: number | null;
  centerLongitude: number | null;
  zoomLevel: number | null;
  refresh: () => Promise<void>;
}

/**
 * The department's pins (`Mapping/GetMapDataAndMarkers` through the persisted map-markers store, so the map shows the
 * last pins offline), refreshed on call/unit/personnel pings, with unit and member positions moved in place by the
 * geolocation hub between refetches. Every snapshot goes through the live-location merge: a position pushed while the
 * request was out is newer than the snapshot it returned.
 */
export function useLiveMapPins(realtime: boolean = true): LiveMapPins {
  const markers = useMapMarkersStore((state) => state.markers);
  const centerLatitude = useMapMarkersStore((state) => state.centerLatitude);
  const centerLongitude = useMapMarkersStore((state) => state.centerLongitude);
  const zoomLevel = useMapMarkersStore((state) => state.zoomLevel);
  const isLoading = useMapMarkersStore((state) => state.loading.markers === true);
  const hasError = useMapMarkersStore((state) => !!state.errors.markers);
  const hasLoaded = useMapMarkersStore((state) => (state.fetchedAt.markers ?? 0) > 0 || state.markers.length > 0);
  const [pins, setPins] = useState<MapMakerInfoData[]>(markers);
  const fetchStartedAtRef = useRef(0);

  const refresh = useCallback(async (options?: { bypassCache?: boolean }) => {
    fetchStartedAtRef.current = Date.now();
    await useMapMarkersStore.getState().fetchMarkers(options);
  }, []);
  const refreshBypassingCache = useCallback(() => refresh({ bypassCache: true }), [refresh]);
  const { applyToFetchedPins } = useMapLiveLocations({ pins, setPins, requestRefresh: () => void refreshBypassingCache(), enabled: realtime });

  useEffect(() => {
    setPins(applyToFetchedPins(markers, fetchStartedAtRef.current));
  }, [applyToFetchedPins, markers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeRefetch(MAP_REFRESH_EVENTS, refreshBypassingCache, realtime);

  return { pins, hasLoaded, isLoading, hasError, centerLatitude, centerLongitude, zoomLevel, refresh: refreshBypassingCache };
}
