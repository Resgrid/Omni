import { getMapDataAndMarkers } from '@resgrid/api';
import type { MapDataAndMarkersData, MapMakerInfoData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/**
 * The department map's pins and centre (`Mapping/GetMapDataAndMarkers`): calls, units, personnel, stations and POIs as
 * the server styles them. Persisted so a console map still shows the last pins offline; the server list is the bound
 * (it is replaced, never appended). Refreshed on call/unit/personnel pushes by the screens that show it.
 */

type MarkersSlice = 'markers';

interface MapMarkersData extends SliceMeta<MarkersSlice> {
  markers: MapMakerInfoData[];
  centerLatitude: number | null;
  centerLongitude: number | null;
  zoomLevel: number | null;
}

export interface MapMarkersState extends MapMarkersData {
  fetchMarkers: (options?: FetchOptions) => Promise<void>;
}

const initialData = (): MapMarkersData => ({ ...emptySliceMeta<MarkersSlice>(), markers: [], centerLatitude: null, centerLongitude: null, zoomLevel: null });

/** The server sends coordinates and zoom as numbers or strings; anything unreadable (or 0,0) is no value. */
const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Pins with a usable position only (the map cannot place the rest). */
export const usableMarkers = (markers: readonly MapMakerInfoData[]): MapMakerInfoData[] =>
  markers.filter((marker) => Number.isFinite(marker.Latitude) && Number.isFinite(marker.Longitude) && !(marker.Latitude === 0 && marker.Longitude === 0));

const applyMapData = (data: MapDataAndMarkersData | null, state: MapMarkersData): Partial<MapMarkersData> => {
  if (!data) return { markers: [] };
  const latitude = toNumber(data.CenterLat);
  const longitude = toNumber(data.CenterLon);
  const hasCenter = latitude !== null && longitude !== null && !(latitude === 0 && longitude === 0);
  return {
    markers: usableMarkers(data.MapMakerInfos ?? []),
    centerLatitude: hasCenter ? latitude : state.centerLatitude,
    centerLongitude: hasCenter ? longitude : state.centerLongitude,
    zoomLevel: toNumber(data.ZoomLevel) ?? state.zoomLevel,
  };
};

type PersistedMapMarkers = Omit<MapMarkersData, 'loading' | 'errors'>;

/** What version 0 wrote: this version's shape (the same partialize), any field possibly missing. */
type PersistedMapMarkersV0 = Partial<PersistedMapMarkers>;

/**
 * v0 → v1: version 0 was written by builds that fetched without `fullSizeIcons`, so Core linked an Omni store build's
 * uploaded `IconUrl` to its 32 px rendition, while `@resgrid/maps` now draws an upload at a quarter of its pixel size
 * (it expects the 128 px image). A restored v0 pin would show at 8 px until the next fetch, so v0 uploads are dropped:
 * those pins draw with their status pin (`PinIconUrl`) or bundled icon at full size until a fetch brings the uploads back.
 */
export function migrateMapMarkersStorage(persisted: PersistedMapMarkersV0 | null, version: number): PersistedMapMarkers {
  const base = initialData();
  const markers = Array.isArray(persisted?.markers) ? persisted.markers : base.markers;

  return {
    markers: version < 1 ? markers.map((marker) => ({ ...marker, IconUrl: null })) : markers,
    centerLatitude: persisted?.centerLatitude ?? base.centerLatitude,
    centerLongitude: persisted?.centerLongitude ?? base.centerLongitude,
    zoomLevel: persisted?.zoomLevel ?? base.zoomLevel,
    fetchedAt: persisted?.fetchedAt ?? base.fetchedAt,
  };
}

let runner: SliceRunner<MarkersSlice, MapMarkersState>;

export const useMapMarkersStore = create<MapMarkersState>()(
  persist(
    (set) => {
      runner = createSliceRunner<MarkersSlice, MapMarkersState>('map-markers', set);
      return {
        ...initialData(),
        fetchMarkers: async (options) => {
          await runner.run('markers', async () => unwrapItem(await getMapDataAndMarkers(getDataApiContext())), applyMapData, { trailing: options?.bypassCache === true });
        },
      };
    },
    dataPersistOptions<MapMarkersState, PersistedMapMarkers>({
      // Frozen name. Version 1: markers fetched with `fullSizeIcons` (128 px uploads); see migrateMapMarkersStorage.
      name: 'omni-map-markers-storage',
      version: 1,
      partialize: (state) => ({ markers: state.markers, centerLatitude: state.centerLatitude, centerLongitude: state.centerLongitude, zoomLevel: state.zoomLevel, fetchedAt: state.fetchedAt }),
      // SAFETY: zustand hands over whatever JSON this name held; version 0 is the PersistedMapMarkersV0 shape and every field is optional.
      migrate: (persisted, version) => migrateMapMarkersStorage(persisted as PersistedMapMarkersV0 | null, version),
    })
  )
);

registerPersistedStore('omni-map-markers-storage', useMapMarkersStore);
registerDataStoreReset<MapMarkersState>('map-markers', useMapMarkersStore, initialData, () => runner.invalidate());
