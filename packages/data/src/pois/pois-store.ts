import { getPoi, getPois, getPoiTypes } from '@resgrid/api';
import type { PoiResultData, PoiTypeResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type PoisSlice = 'pois' | 'destinationPois' | 'poiTypes' | 'detail';

interface PoisData extends SliceMeta<PoisSlice> {
  pois: PoiResultData[];
  /** POIs that can be a status/call destination (hospitals etc.). */
  destinationPois: PoiResultData[];
  poiTypes: PoiTypeResultData[];
  /** Responder detail cache: a POI opened once stays readable offline. */
  poiDetailsById: Record<number, PoiResultData>;
}

export interface PoisState extends PoisData {
  /** Skips when already loaded unless `bypassCache` (Dispatch). */
  fetchPois: (options?: FetchOptions) => Promise<void>;
  fetchDestinationPois: (options?: FetchOptions) => Promise<void>;
  fetchPoiTypes: (options?: FetchOptions) => Promise<void>;
  fetchPoi: (poiId: number, options?: FetchOptions) => Promise<PoiResultData | null>;
}

const initialData = (): PoisData => ({ ...emptySliceMeta<PoisSlice>(), pois: [], destinationPois: [], poiTypes: [], poiDetailsById: {} });

let runner: SliceRunner<PoisSlice, PoisState>;

export const usePoisStore = create<PoisState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<PoisSlice, PoisState>('pois', set);
      return {
        ...initialData(),

        fetchPois: async (options) => {
          if (!options?.bypassCache && get().pois.length > 0) return;
          // poiTypeId 0 = every type.
          await runner.run(
            'pois',
            async () => unwrapList(await getPois(getDataApiContext(), { poiTypeId: 0 }, cacheOptions(options))),
            (pois) => ({ pois })
          );
        },

        fetchDestinationPois: async (options) => {
          if (!options?.bypassCache && get().destinationPois.length > 0) return;
          await runner.run(
            'destinationPois',
            async () => unwrapList(await getPois(getDataApiContext(), { poiTypeId: 0, destinationOnly: true }, cacheOptions(options))),
            (destinationPois) => ({ destinationPois })
          );
        },

        fetchPoiTypes: async (options) => {
          if (!options?.bypassCache && get().poiTypes.length > 0) return;
          await runner.run(
            'poiTypes',
            async () => unwrapList(await getPoiTypes(getDataApiContext(), cacheOptions(options))),
            (poiTypes) => ({ poiTypes })
          );
        },

        fetchPoi: async (poiId, options) => {
          const cached = get().poiDetailsById[poiId] ?? get().pois.find((poi) => poi.PoiId === poiId);
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getPoi(getDataApiContext(), { poiId }, cacheOptions(options))),
            (poi, state) => (poi ? { poiDetailsById: { ...state.poiDetailsById, [poiId]: poi } } : {}),
            { flightKey: `detail:${poiId}` }
          );
          return result.ok ? result.value : (cached ?? null);
        },
      };
    },
    dataPersistOptions<PoisState, Omit<PoisData, 'loading' | 'errors'>>({
      name: 'omni-pois-storage',
      partialize: (state) => ({ pois: state.pois, destinationPois: state.destinationPois, poiTypes: state.poiTypes, poiDetailsById: state.poiDetailsById, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-pois-storage', usePoisStore);
registerDataStoreReset<PoisState>('pois', usePoisStore, initialData, () => runner.invalidate());

export const selectPoiById = (state: Pick<PoisState, 'pois' | 'poiDetailsById'>, poiId: number): PoiResultData | undefined => state.poiDetailsById[poiId] ?? state.pois.find((poi) => poi.PoiId === poiId);
