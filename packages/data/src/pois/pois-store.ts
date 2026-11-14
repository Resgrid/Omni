import { getNearestDestinations, getPoi, getPoiCapabilities, getPois, getPoiTypes, setPoiAvailability } from '@resgrid/api';
import type { NearestDestinationResultData, PoiCapabilityResultData, PoiResultData, PoiTypeResultData, SetPoiAvailabilityInput } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type Enveloped, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type PoisSlice = 'pois' | 'destinationPois' | 'poiTypes' | 'detail' | 'capabilities';

interface PoisData extends SliceMeta<PoisSlice> {
  pois: PoiResultData[];
  /** POIs that can be a status/call destination (hospitals etc.). */
  destinationPois: PoiResultData[];
  poiTypes: PoiTypeResultData[];
  /** Responder detail cache: a POI opened once stays readable offline. */
  poiDetailsById: Record<number, PoiResultData>;
  /** The department's POI capabilities ("Cath Lab"), in its order (Core M0315; empty on older servers). */
  poiCapabilities: PoiCapabilityResultData[];
}

/** What a destination availability change returned: the destination after it, or why it failed. */
export type SetPoiAvailabilityOutcome = { ok: true; poi: PoiResultData | null } | { ok: false; error: DataError };

/** Parameters of a nearest-destination ranking (`GET /Mapping/GetNearestDestinations`). */
export interface NearestDestinationsQuery {
  latitude: number;
  longitude: number;
  capabilityId?: string | null;
  unitId?: number | string | null;
  take?: number;
}

export interface PoisState extends PoisData {
  /** Skips when already loaded unless `bypassCache` (Dispatch). */
  fetchPois: (options?: FetchOptions) => Promise<void>;
  fetchDestinationPois: (options?: FetchOptions) => Promise<void>;
  fetchPoiTypes: (options?: FetchOptions) => Promise<void>;
  fetchPoi: (poiId: number, options?: FetchOptions) => Promise<PoiResultData | null>;
  fetchPoiCapabilities: (options?: FetchOptions) => Promise<void>;
  /**
   * Sets a destination's availability online (dispatchers; Core refuses others). The loaded copies of the POI are replaced
   * with what the server returned. Not queued offline: an availability report is only true now.
   */
  setPoiAvailability: (input: SetPoiAvailabilityInput) => Promise<SetPoiAvailabilityOutcome>;
  /** Ranks destinations from a point; null when the server could not answer (callers keep their own order). Not stored. */
  fetchNearestDestinations: (query: NearestDestinationsQuery, signal?: AbortSignal) => Promise<NearestDestinationResultData[] | null>;
}

const replacePoi = (list: PoiResultData[], poi: PoiResultData): PoiResultData[] => (list.some((item) => item.PoiId === poi.PoiId) ? list.map((item) => (item.PoiId === poi.PoiId ? poi : item)) : list);

/**
 * Availability saved here, by POI, with the write it came from. A read that started before a save can answer after it with
 * the old report: the saved destination replaces that answer's copy, so a destination marked closed never reads as open
 * again until a read that started after the save. Cleared on reset.
 */
let availabilityWrites = 0;
const savedAvailability = new Map<number, { write: number; poi: PoiResultData }>();

/** The read's answer with every destination saved after the read started in place of its copy. */
const withLaterSaves = (list: PoiResultData[], readStartedAt: number): PoiResultData[] => {
  if (savedAvailability.size === 0) return list;

  return list.map((item) => {
    const saved = savedAvailability.get(item.PoiId);

    return saved && saved.write > readStartedAt ? saved.poi : item;
  });
};

/** One destination as a read answered it, or the copy saved after the read started. */
const laterSaveOf = (poi: PoiResultData, readStartedAt: number): PoiResultData => {
  const saved = savedAvailability.get(poi.PoiId);

  return saved && saved.write > readStartedAt ? saved.poi : poi;
};

const initialData = (): PoisData => ({ ...emptySliceMeta<PoisSlice>(), pois: [], destinationPois: [], poiTypes: [], poiDetailsById: {}, poiCapabilities: [] });

let runner: SliceRunner<PoisSlice, PoisState>;

export const usePoisStore = create<PoisState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<PoisSlice, PoisState>('pois', set);

      return {
        ...initialData(),

        fetchPois: async (options) => {
          if (!options?.bypassCache && get().pois.length > 0) return;
          const readStartedAt = availabilityWrites;
          await runner.run(
            'pois',
            async () => unwrapList(await getPois(getDataApiContext(), {}, cacheOptions(options))),
            (pois) => ({ pois: withLaterSaves(pois, readStartedAt) })
          );
        },

        fetchDestinationPois: async (options) => {
          if (!options?.bypassCache && get().destinationPois.length > 0) return;
          const readStartedAt = availabilityWrites;
          await runner.run(
            'destinationPois',
            async () => unwrapList(await getPois(getDataApiContext(), { destinationOnly: true }, cacheOptions(options))),
            (destinationPois) => ({ destinationPois: withLaterSaves(destinationPois, readStartedAt) })
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

          const readStartedAt = availabilityWrites;

          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getPoi(getDataApiContext(), { poiId }, cacheOptions(options))),
            (poi, state) => (poi ? { poiDetailsById: { ...state.poiDetailsById, [poiId]: laterSaveOf(poi, readStartedAt) } } : {}),
            { flightKey: `detail:${poiId}` }
          );

          if (!result.ok) return cached ?? null;

          return result.value ? laterSaveOf(result.value, readStartedAt) : null;
        },

        fetchPoiCapabilities: async (options) => {
          if (!options?.bypassCache && get().poiCapabilities.length > 0) return;
          await runner.run(
            'capabilities',
            async () => unwrapList(await getPoiCapabilities(getDataApiContext(), cacheOptions(options))),
            (poiCapabilities) => ({ poiCapabilities })
          );
        },

        setPoiAvailability: async (input) => {
          // A sign-out or department switch while the request is out: its answer belongs to the old session.
          const startedIn = runner.generation();

          try {
            const response = await setPoiAvailability(getDataApiContext(), input);
            // SAFETY: SetPoiAvailabilityResult is the v4 envelope (Data + Status); unwrapItem checks Status and returns null for a missing Data.
            const poi = unwrapItem(response as Enveloped<PoiResultData>);

            if (poi && startedIn === runner.generation()) {
              availabilityWrites += 1;
              savedAvailability.set(poi.PoiId, { write: availabilityWrites, poi });
              set((state) => ({
                pois: replacePoi(state.pois, poi),
                destinationPois: replacePoi(state.destinationPois, poi),
                poiDetailsById: { ...state.poiDetailsById, [poi.PoiId]: poi },
              }));
            }

            return { ok: true, poi };
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'Setting destination availability failed', context: { poiId: input.PoiId, code: dataError.code, status: dataError.status } });

            return { ok: false, error: dataError };
          }
        },

        fetchNearestDestinations: async (query, signal) => {
          try {
            const params: Parameters<typeof getNearestDestinations>[1] = { latitude: query.latitude, longitude: query.longitude };

            if (query.capabilityId) params.capabilityId = query.capabilityId;

            if (query.unitId !== null && query.unitId !== undefined && query.unitId !== '') params.unitId = query.unitId;

            if (query.take) params.take = query.take;

            const response = await getNearestDestinations(getDataApiContext(), params, signal ? { signal } : undefined);

            // SAFETY: NearestDestinationsResult is the v4 list envelope (Data + Status); unwrapList checks Status.
            return unwrapList(response as Enveloped<NearestDestinationResultData[]>);
          } catch (error) {
            if (signal?.aborted) return null;
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'Nearest destinations failed', context: { code: dataError.code, status: dataError.status } });

            // Never block a status or a call: the lists fall back to their own order.
            return null;
          }
        },
      };
    },
    dataPersistOptions<PoisState, Omit<PoisData, 'loading' | 'errors'>>({
      name: 'omni-pois-storage',
      partialize: (state) => ({
        pois: state.pois,
        destinationPois: state.destinationPois,
        poiTypes: state.poiTypes,
        poiDetailsById: state.poiDetailsById,
        poiCapabilities: state.poiCapabilities,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-pois-storage', usePoisStore);

registerDataStoreReset<PoisState>('pois', usePoisStore, initialData, () => {
  runner.invalidate();
  savedAvailability.clear();
});

export const selectPoiById = (state: Pick<PoisState, 'pois' | 'poiDetailsById'>, poiId: number): PoiResultData | undefined => state.poiDetailsById[poiId] ?? state.pois.find((poi) => poi.PoiId === poiId);
