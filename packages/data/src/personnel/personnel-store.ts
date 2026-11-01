import { getAllGroups, getAllPersonnelInfos, getAllPersonnelStaffings, getAllPersonnelStatuses, getPersonnelFilterOptions } from '@resgrid/api';
import type { FilterResultData, GroupResultData, PersonnelInfoResultData, StatusesResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type PersonnelSlice = 'personnel' | 'filterOptions' | 'statusOptions' | 'staffingOptions' | 'groups';

interface PersonnelData extends SliceMeta<PersonnelSlice> {
  /** Members with their current status and staffing (Responder/Dispatch). */
  personnel: PersonnelInfoResultData[];
  /** Renamed from Unit/IC/Dispatch's `getUnitsFilterOptions` (plan §7.4). */
  filterOptions: FilterResultData[];
  /** The department's personnel status options (custom or built-in). */
  statusOptions: StatusesResultData[];
  staffingOptions: StatusesResultData[];
  /** Groups / stations (status destinations, filters). */
  groups: GroupResultData[];
}

export interface PersonnelState extends PersonnelData {
  fetchPersonnel: (options?: FetchOptions & { activeFilter?: string }) => Promise<void>;
  getPersonnelFilterOptions: (options?: FetchOptions) => Promise<void>;
  fetchStatusOptions: (options?: FetchOptions) => Promise<void>;
  fetchGroups: (options?: FetchOptions) => Promise<void>;
  init: (options?: FetchOptions) => Promise<void>;
}

const initialData = (): PersonnelData => ({ ...emptySliceMeta<PersonnelSlice>(), personnel: [], filterOptions: [], statusOptions: [], staffingOptions: [], groups: [] });

let runner: SliceRunner<PersonnelSlice, PersonnelState>;

export const usePersonnelStore = create<PersonnelState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<PersonnelSlice, PersonnelState>('personnel', set);
      return {
        ...initialData(),

        fetchPersonnel: async (options) => {
          await runner.run(
            'personnel',
            async () => unwrapList(await getAllPersonnelInfos(getDataApiContext(), { activeFilter: options?.activeFilter ?? '' })),
            (personnel) => ({ personnel }),
            { trailing: options?.bypassCache === true }
          );
        },

        getPersonnelFilterOptions: async (options) => {
          await runner.run(
            'filterOptions',
            async () => unwrapList(await getPersonnelFilterOptions(getDataApiContext(), cacheOptions(options))),
            (filterOptions) => ({ filterOptions })
          );
        },

        fetchStatusOptions: async () => {
          await Promise.all([
            runner.run(
              'statusOptions',
              async () => unwrapList(await getAllPersonnelStatuses(getDataApiContext())),
              (statusOptions) => ({ statusOptions })
            ),
            runner.run(
              'staffingOptions',
              async () => unwrapList(await getAllPersonnelStaffings(getDataApiContext())),
              (staffingOptions) => ({ staffingOptions })
            ),
          ]);
        },

        fetchGroups: async (options) => {
          await runner.run(
            'groups',
            async () => unwrapList(await getAllGroups(getDataApiContext(), cacheOptions(options))),
            (groups) => ({ groups })
          );
        },

        init: async (options) => {
          await Promise.all([get().fetchPersonnel(options), get().fetchStatusOptions(options), get().fetchGroups(options)]);
        },
      };
    },
    dataPersistOptions<PersonnelState, Omit<PersonnelData, 'loading' | 'errors'>>({
      name: 'omni-personnel-storage',
      partialize: (state) => ({
        personnel: state.personnel,
        filterOptions: state.filterOptions,
        statusOptions: state.statusOptions,
        staffingOptions: state.staffingOptions,
        groups: state.groups,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-personnel-storage', usePersonnelStore);
registerDataStoreReset<PersonnelState>('personnel', usePersonnelStore, initialData, () => runner.invalidate());

export const personnelFullName = (person: Pick<PersonnelInfoResultData, 'FirstName' | 'LastName'>): string => `${person.FirstName || ''} ${person.LastName || ''}`.trim();

/** Stations are groups of type 2 (Responder). */
export const isStationGroup = (group: Pick<GroupResultData, 'TypeId'>): boolean => `${group.TypeId ?? ''}` === '2';
