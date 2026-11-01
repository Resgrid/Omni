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
    dataPersistOptions<MapMarkersState, Omit<MapMarkersData, 'loading' | 'errors'>>({
      name: 'omni-map-markers-storage',
      partialize: (state) => ({ markers: state.markers, centerLatitude: state.centerLatitude, centerLongitude: state.centerLongitude, zoomLevel: state.zoomLevel, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-map-markers-storage', useMapMarkersStore);
registerDataStoreReset<MapMarkersState>('map-markers', useMapMarkersStore, initialData, () => runner.invalidate());
