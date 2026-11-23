import {
  getAllActiveLayers,
  getCustomMap,
  getCustomMapLayer,
  getCustomMaps,
  getIndoorMap,
  getIndoorMapFloor,
  getIndoorMaps,
  getIndoorMapZonesGeoJSON,
  getMapLayerGeoJSON,
  getMapLayers,
  searchAllMapFeatures,
} from '@resgrid/api';
import type {
  ActiveLayerResultData,
  CustomMapLayerResultData,
  CustomMapResultData,
  GetCustomMapResultData,
  GetIndoorMapResultData,
  GetMapLayersData,
  IndoorMapFloorResultData,
  IndoorMapResultData,
  MapFeatureResultData,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapGeoJSON, unwrapItem, unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, isSliceFresh, type SliceMeta, type SliceRunner } from '../core/slices';

type MapsSlice = 'activeLayers' | 'mapLayers' | 'layerGeoJSON' | 'indoorMaps' | 'indoorMap' | 'floor' | 'zones' | 'customMaps' | 'customMap' | 'customMapLayer' | 'search';

/** A department map layer's details from `Mapping/GetMayLayers`, without its geometry (that comes per layer, on demand). */
export type MapLayerInfo = Omit<GetMapLayersData, 'Data'>;

/** GetMayLayers sends every layer's geometry, so a map opened again within this window reuses the list. */
export const MAP_LAYERS_MAX_AGE_MS = 5 * 60 * 1000;

/** Top-level department layers (Core `MapLayerTypes.TopLevel`). */
const TOP_LEVEL_LAYER_TYPE = 0;

const withoutGeometry = ({ Data: _geometry, ...info }: GetMapLayersData): MapLayerInfo => info;

/** `Mapping/SearchAllMapFeatures` scope. */
export type MapFeatureSearchScope = 'all' | 'indoor' | 'custom';

/**
 * Department map data (IC custom/indoor maps, `maps.customIndoor`). Map rendering, layer toggles and the
 * selected floor are view state and live in @resgrid/maps / features; this store only holds server data.
 * Offline map packs are owned by the MapLibre plan §19.
 */
interface CustomMapsData extends SliceMeta<MapsSlice> {
  activeLayers: ActiveLayerResultData[];
  /** Every department layer with its description, event dates and contact (`Mapping/GetMayLayers`, geometry dropped). */
  mapLayers: MapLayerInfo[];
  /** GeoJSON per layer id (FeatureCollection; typed loosely here, parsed by @resgrid/maps). */
  layerGeoJSON: Record<string, unknown>;
  indoorMaps: IndoorMapResultData[];
  indoorMapById: Record<string, GetIndoorMapResultData>;
  floorById: Record<string, IndoorMapFloorResultData>;
  zonesGeoJSONByFloor: Record<string, unknown>;
  customMaps: CustomMapResultData[];
  customMapById: Record<string, GetCustomMapResultData>;
  /** Single custom map layers with their regions (`Mapping/GetCustomMapLayer/{layerId}`), e.g. to name a call's indoor location. */
  customMapLayerById: Record<string, CustomMapLayerResultData>;
  /** The latest map feature search (online only, never persisted). */
  searchResults: MapFeatureResultData[];
  searchTerm: string;
}

export interface CustomMapsState extends CustomMapsData {
  fetchActiveLayers: (options?: FetchOptions) => Promise<void>;
  /** The department's layers with their details; skipped while the list is fresh (it carries every layer's geometry). */
  fetchMapLayers: (options?: FetchOptions) => Promise<void>;
  fetchLayerGeoJSON: (layerId: string, options?: FetchOptions) => Promise<unknown>;
  fetchIndoorMaps: (options?: FetchOptions) => Promise<void>;
  fetchIndoorMap: (mapId: string, options?: FetchOptions) => Promise<void>;
  fetchIndoorFloor: (floorId: string, options?: FetchOptions) => Promise<void>;
  fetchFloorZones: (floorId: string, options?: FetchOptions) => Promise<unknown>;
  fetchCustomMaps: (type?: number, options?: FetchOptions) => Promise<void>;
  fetchCustomMap: (mapId: string, options?: FetchOptions) => Promise<void>;
  /** One custom map layer with its regions (a call's indoor location on a custom map). */
  fetchCustomMapLayer: (layerId: string, options?: FetchOptions) => Promise<void>;
  /** Indoor zones and custom map regions by name (`Mapping/SearchAllMapFeatures`); a blank term clears the results. */
  searchMapFeatures: (term: string, scope?: MapFeatureSearchScope) => Promise<void>;
  clearMapSearch: () => void;
}

const initialData = (): CustomMapsData => ({
  ...emptySliceMeta<MapsSlice>(),
  activeLayers: [],
  mapLayers: [],
  layerGeoJSON: {},
  indoorMaps: [],
  indoorMapById: {},
  floorById: {},
  zonesGeoJSONByFloor: {},
  customMaps: [],
  customMapById: {},
  customMapLayerById: {},
  searchResults: [],
  searchTerm: '',
});

let runner: SliceRunner<MapsSlice, CustomMapsState>;

export const useCustomMapsStore = create<CustomMapsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<MapsSlice, CustomMapsState>('custom-maps', set);
      return {
        ...initialData(),

        fetchActiveLayers: async (options) => {
          await runner.run(
            'activeLayers',
            async () => unwrapList(await getAllActiveLayers(getDataApiContext(), cacheOptions(options))),
            (activeLayers) => ({ activeLayers })
          );
        },

        fetchMapLayers: async (options) => {
          if (!options?.bypassCache && isSliceFresh(get(), 'mapLayers', MAP_LAYERS_MAX_AGE_MS)) return;
          await runner.run(
            'mapLayers',
            async () => (unwrapItem(await getMapLayers(getDataApiContext(), { type: TOP_LEVEL_LAYER_TYPE }))?.Layers ?? []).filter((layer) => !!layer?.Id).map(withoutGeometry),
            (mapLayers) => ({ mapLayers })
          );
        },

        fetchLayerGeoJSON: async (layerId, options) => {
          const cached = get().layerGeoJSON[layerId];
          if (cached !== undefined && !options?.bypassCache) return cached;
          const result = await runner.run(
            'layerGeoJSON',
            async () => unwrapGeoJSON(await getMapLayerGeoJSON(getDataApiContext(), { layerId })),
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
            async () => unwrapGeoJSON(await getIndoorMapZonesGeoJSON(getDataApiContext(), { floorId })),
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

        fetchCustomMapLayer: async (layerId) => {
          await runner.run(
            'customMapLayer',
            async () => unwrapItem(await getCustomMapLayer(getDataApiContext(), { layerId })),
            (layer, state) => (layer ? { customMapLayerById: { ...state.customMapLayerById, [layerId]: layer } } : {}),
            { flightKey: `customMapLayer:${layerId}` }
          );
        },

        searchMapFeatures: async (term, scope = 'all') => {
          const trimmed = term.trim();

          if (!trimmed) {
            set({ searchResults: [], searchTerm: '' });

            return;
          }

          set({ searchTerm: trimmed });
          await runner.run(
            'search',
            async () => unwrapList(await searchAllMapFeatures(getDataApiContext(), { term: trimmed, type: scope })),
            // A slower answer for an older term must not replace a newer one.
            (searchResults, state) => (state.searchTerm === trimmed ? { searchResults } : {}),
            { flightKey: `search:${scope}:${trimmed}` }
          );
        },

        clearMapSearch: () => set({ searchResults: [], searchTerm: '' }),
      };
    },
    dataPersistOptions<CustomMapsState, Omit<CustomMapsData, 'loading' | 'errors' | 'layerGeoJSON' | 'zonesGeoJSONByFloor' | 'searchResults' | 'searchTerm'>>({
      name: 'omni-custom-maps-storage',
      // GeoJSON can be large; it is re-read online or comes from the DepartmentData offline bundle (MapLibre §19).
      partialize: (state) => ({
        activeLayers: state.activeLayers,
        mapLayers: state.mapLayers,
        indoorMaps: state.indoorMaps,
        indoorMapById: state.indoorMapById,
        floorById: state.floorById,
        customMaps: state.customMaps,
        customMapById: state.customMapById,
        customMapLayerById: state.customMapLayerById,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-custom-maps-storage', useCustomMapsStore);
registerDataStoreReset<CustomMapsState>('custom-maps', useCustomMapsStore, initialData, () => runner.invalidate());
