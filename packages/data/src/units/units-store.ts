import { getAllUnits, getAllUnitsInfos, getAllUnitStatuses, getUnitsFilterOptions, getUnitTypeStatuses } from '@resgrid/api';
import type { FilterResultData, UnitInfoResultData, UnitResultData, UnitStatusResultData, UnitTypeStatusResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type UnitsSlice = 'units' | 'unitTypeStatuses' | 'currentStatuses' | 'unitInfos' | 'filterOptions';

interface UnitsData extends SliceMeta<UnitsSlice> {
  units: UnitResultData[];
  /** Custom status sets per unit type (`Statuses/GetAllUnitStatuses`). */
  unitTypeStatuses: UnitTypeStatusResultData[];
  /** Live per-unit status snapshot (state text/colour, destination, ETA) — IC data shape. */
  unitCurrentStatuses: UnitStatusResultData[];
  unitInfos: UnitInfoResultData[];
  filterOptions: FilterResultData[];
}

export interface UnitsState extends UnitsData {
  /** Roster + type statuses + current statuses, settled so a failing status endpoint cannot take the roster down (IC). */
  fetchUnits: (options?: FetchOptions) => Promise<void>;
  fetchUnitStatuses: (options?: FetchOptions) => Promise<void>;
  fetchUnitInfos: (options?: FetchOptions & { activeFilter?: string }) => Promise<void>;
  fetchFilterOptions: (options?: FetchOptions) => Promise<void>;
}

const initialData = (): UnitsData => ({ ...emptySliceMeta<UnitsSlice>(), units: [], unitTypeStatuses: [], unitCurrentStatuses: [], unitInfos: [], filterOptions: [] });

let runner: SliceRunner<UnitsSlice, UnitsState>;

export const useUnitsStore = create<UnitsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<UnitsSlice, UnitsState>('units', set);
      return {
        ...initialData(),

        fetchUnits: async (options) => {
          const trailing = options?.bypassCache === true;
          await Promise.all([
            runner.run(
              'units',
              async () => unwrapList(await getAllUnits(getDataApiContext(), cacheOptions(options))),
              (units) => ({ units }),
              { trailing }
            ),
            runner.run(
              'unitTypeStatuses',
              // The API types this action as unit statuses; Core answers with UnitTypeStatusResultData (custom status sets per type).
              async () => unwrapList(await getUnitTypeStatuses(getDataApiContext())) as unknown as UnitTypeStatusResultData[],
              (unitTypeStatuses) => ({ unitTypeStatuses }),
              { trailing }
            ),
            get().fetchUnitStatuses(options),
          ]);
        },

        fetchUnitStatuses: async (options) => {
          await runner.run(
            'currentStatuses',
            async () => unwrapList(await getAllUnitStatuses(getDataApiContext())),
            (unitCurrentStatuses) => ({ unitCurrentStatuses }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchUnitInfos: async (options) => {
          await runner.run(
            'unitInfos',
            async () => unwrapList(await getAllUnitsInfos(getDataApiContext(), { activeFilter: options?.activeFilter ?? '' }, cacheOptions(options))),
            (unitInfos) => ({ unitInfos }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchFilterOptions: async (options) => {
          await runner.run(
            'filterOptions',
            async () => unwrapList(await getUnitsFilterOptions(getDataApiContext(), cacheOptions(options))),
            (filterOptions) => ({ filterOptions })
          );
        },
      };
    },
    dataPersistOptions<UnitsState, Omit<UnitsData, 'loading' | 'errors'>>({
      name: 'omni-units-storage',
      partialize: (state) => ({
        units: state.units,
        unitTypeStatuses: state.unitTypeStatuses,
        unitCurrentStatuses: state.unitCurrentStatuses,
        unitInfos: state.unitInfos,
        filterOptions: state.filterOptions,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-units-storage', useUnitsStore);
registerDataStoreReset<UnitsState>('units', useUnitsStore, initialData, () => runner.invalidate());

export const selectUnitById = (state: Pick<UnitsState, 'units'>, unitId: string): UnitResultData | undefined => state.units.find((unit) => unit.UnitId === unitId);

export const selectUnitCurrentStatus = (state: Pick<UnitsState, 'unitCurrentStatuses'>, unitId: string): UnitStatusResultData | undefined => state.unitCurrentStatuses.find((status) => status.UnitId === unitId);
