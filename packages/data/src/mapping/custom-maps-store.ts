import { getAllActiveLayers, getCustomMap, getCustomMaps, getIndoorMap, getIndoorMapFloor, getIndoorMaps, getIndoorMapZonesGeoJSON, getMapLayerGeoJSON } from '@resgrid/api';
import type { ActiveLayerResultData, CustomMapResultData, GetCustomMapResultData, GetIndoorMapResultData, IndoorMapFloorResultData, IndoorMapResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type MapsSlice = 'activeLayers' | 'layerGeoJSON' | 'indoorMaps' | 'indoorMap' | 'floor' | 'zones' | 'customMaps' | 'customMap';

/**
 * Department map data (IC custom/indoor maps, `maps.customIndoor`). Map rendering, layer toggles and the
 * selected floor are view state and live in @resgrid/maps / features; this store only holds server data.
 * Offline map packs are owned by the MapLibre plan §19.
 */
interface CustomMapsData extends SliceMeta<MapsSlice> {
  activeLayers: ActiveLayerResultData[];
  /** GeoJSON per layer id (FeatureCollection; typed loosely here, parsed by @resgrid/maps). */
  layerGeoJSON: Record<string, unknown>;
  indoorMaps: IndoorMapResultData[];
  indoorMapById: Record<string, GetIndoorMapResultData>;
  floorById: Record<string, IndoorMapFloorResultData>;
  zonesGeoJSONByFloor: Record<string, unknown>;
  customMaps: CustomMapResultData[];
  customMapById: Record<string, GetCustomMapResultData>;
}

export interface CustomMapsState extends CustomMapsData {
  fetchActiveLayers: (options?: FetchOptions) => Promise<void>;
  fetchLayerGeoJSON: (layerId: string, options?: FetchOptions) => Promise<unknown>;
  fetchIndoorMaps: (options?: FetchOptions) => Promise<void>;
  fetchIndoorMap: (mapId: string, options?: FetchOptions) => Promise<void>;
  fetchIndoorFloor: (floorId: string, options?: FetchOptions) => Promise<void>;
  fetchFloorZones: (floorId: string, options?: FetchOptions) => Promise<unknown>;
  fetchCustomMaps: (type?: number, options?: FetchOptions) => Promise<void>;
  fetchCustomMap: (mapId: string, options?: FetchOptions) => Promise<void>;
}

const initialData = (): CustomMapsData => ({
  ...emptySliceMeta<MapsSlice>(),
  activeLayers: [],
  layerGeoJSON: {},
  indoorMaps: [],
  indoorMapById: {},
  floorById: {},
  zonesGeoJSONByFloor: {},
  customMaps: [],
  customMapById: {},
});

let runner: SliceRunner<MapsSlice, CustomMapsState>;

export const useCustomMapsStore = create<CustomMapsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<MapsSlice, CustomMapsState>('custom-maps', set);
      return {
        ...initialData(),

        fetchActiveLayers: async () => {
          await runner.run(
            'activeLayers',
            async () => unwrapList(await getAllActiveLayers(getDataApiContext())),
            (activeLayers) => ({ activeLayers })
          );
        },

        fetchLayerGeoJSON: async (layerId, options) => {
          const cached = get().layerGeoJSON[layerId];
          if (cached !== undefined && !options?.bypassCache) return cached;
          const result = await runner.run(
            'layerGeoJSON',
            async () => unwrapItem(await getMapLayerGeoJSON(getDataApiContext(), { layerId })),
            (geo, state) => ({ layerGeoJSON: { ...state.layerGeoJSON, [layerId]: geo } }),
            { flightKey: `layer:${layerId}` }
          );
          return result.ok ? result.value : (cached ?? null);
        },

        fetchIndoorMaps: async () => {
          await runner.run(
            'indoorMaps',
            async () => unwrapList(await getIndoorMaps(getDataApiContext())),
            (indoorMaps) => ({ indoorMaps })
          );
        },

        fetchIndoorMap: async (mapId) => {
          await runner.run(
            'indoorMap',
            async () => unwrapItem(await getIndoorMap(getDataApiContext(), { id: mapId })),
            (map, state) => (map ? { indoorMapById: { ...state.indoorMapById, [mapId]: map } } : {}),
            { flightKey: `indoorMap:${mapId}` }
          );
        },

        fetchIndoorFloor: async (floorId) => {
          await runner.run(
            'floor',
            async () => unwrapItem(await getIndoorMapFloor(getDataApiContext(), { floorId })),
            (floor, state) => (floor ? { floorById: { ...state.floorById, [floorId]: floor } } : {}),
            { flightKey: `floor:${floorId}` }
          );
        },

        fetchFloorZones: async (floorId, options) => {
          const cached = get().zonesGeoJSONByFloor[floorId];
          if (cached !== undefined && !options?.bypassCache) return cached;
          const result = await runner.run(
            'zones',
            async () => unwrapItem(await getIndoorMapZonesGeoJSON(getDataApiContext(), { floorId })),
            (geo, state) => ({ zonesGeoJSONByFloor: { ...state.zonesGeoJSONByFloor, [floorId]: geo } }),
            { flightKey: `zones:${floorId}` }
          );
          return result.ok ? result.value : (cached ?? null);
        },

        fetchCustomMaps: async (type) => {
          await runner.run(
            'customMaps',
            async () => unwrapList(await getCustomMaps(getDataApiContext(), type === undefined ? {} : { type })),
            (customMaps) => ({ customMaps })
          );
        },

        fetchCustomMap: async (mapId) => {
          await runner.run(
            'customMap',
            async () => unwrapItem(await getCustomMap(getDataApiContext(), { id: mapId })),
            (map, state) => (map ? { customMapById: { ...state.customMapById, [mapId]: map } } : {}),
            { flightKey: `customMap:${mapId}` }
          );
        },
      };
    },
    dataPersistOptions<CustomMapsState, Omit<CustomMapsData, 'loading' | 'errors' | 'layerGeoJSON' | 'zonesGeoJSONByFloor'>>({
      name: 'omni-custom-maps-storage',
      // GeoJSON can be large; it is re-read online or comes from the DepartmentData offline bundle (MapLibre §19).
      partialize: (state) => ({
        activeLayers: state.activeLayers,
        indoorMaps: state.indoorMaps,
        indoorMapById: state.indoorMapById,
        floorById: state.floorById,
        customMaps: state.customMaps,
        customMapById: state.customMapById,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-custom-maps-storage', useCustomMapsStore);
registerDataStoreReset<CustomMapsState>('custom-maps', useCustomMapsStore, initialData, () => runner.invalidate());
