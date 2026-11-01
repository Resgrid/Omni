import { getAllUnitRolesAndAssignmentsForDepartment, getRoleAssignmentsForUnit, getRolesForUnit, setRoleAssignmentsForUnit } from '@resgrid/api';
import type { ActiveUnitRoleResultData, SetUnitRolesInput, UnitRoleResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type RolesSlice = 'roles' | 'unitRoles' | 'assignments';

interface UnitRolesData extends SliceMeta<RolesSlice> {
  /** Every unit's seats and current crew in the department. */
  roles: ActiveUnitRoleResultData[];
  /** Seats defined per unit. */
  rolesByUnit: Record<string, UnitRoleResultData[]>;
  /** Current crew per unit (who sits where). */
  assignmentsByUnit: Record<string, ActiveUnitRoleResultData[]>;
}

export interface UnitRolesState extends UnitRolesData {
  fetchRoles: (options?: FetchOptions) => Promise<void>;
  fetchRolesForUnit: (unitId: string, options?: FetchOptions) => Promise<void>;
  fetchAssignmentsForUnit: (unitId: string, options?: FetchOptions) => Promise<void>;
  fetchAllForUnit: (unitId: string, options?: FetchOptions) => Promise<void>;
  /** Online only. Throws so the caller can tell the crew the save failed (Unit); the loaded seats stay. */
  assignRoles: (input: SetUnitRolesInput) => Promise<void>;
}

const initialData = (): UnitRolesData => ({ ...emptySliceMeta<RolesSlice>(), roles: [], rolesByUnit: {}, assignmentsByUnit: {} });

let runner: SliceRunner<RolesSlice, UnitRolesState>;

export const useUnitRolesStore = create<UnitRolesState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<RolesSlice, UnitRolesState>('unit-roles', set);
      return {
        ...initialData(),

        fetchRoles: async () => {
          await runner.run(
            'roles',
            async () => unwrapList(await getAllUnitRolesAndAssignmentsForDepartment(getDataApiContext())),
            (roles) => ({ roles })
          );
        },

        fetchRolesForUnit: async (unitId, options) => {
          await runner.run(
            'unitRoles',
            async () => unwrapList(await getRolesForUnit(getDataApiContext(), { unitId }, cacheOptions(options))),
            (list, state) => ({ rolesByUnit: { ...state.rolesByUnit, [unitId]: list } }),
            { flightKey: `unitRoles:${unitId}` }
          );
        },

        fetchAssignmentsForUnit: async (unitId, options) => {
          await runner.run(
            'assignments',
            async () => unwrapList(await getRoleAssignmentsForUnit(getDataApiContext(), { unitId })),
            (list, state) => ({ assignmentsByUnit: { ...state.assignmentsByUnit, [unitId]: list } }),
            { flightKey: `assignments:${unitId}`, trailing: options?.bypassCache === true }
          );
        },

        fetchAllForUnit: async (unitId, options) => {
          await Promise.all([get().fetchRoles(options), get().fetchRolesForUnit(unitId, options), get().fetchAssignmentsForUnit(unitId, options)]);
        },

        assignRoles: async (input) => {
          const result = assertV4Success(await setRoleAssignmentsForUnit(getDataApiContext(), input));
          const list = unwrapList(result);
          set((state) => ({ assignmentsByUnit: { ...state.assignmentsByUnit, [input.UnitId]: list.length > 0 ? list : (state.assignmentsByUnit[input.UnitId] ?? []) } }));
          await get().fetchAssignmentsForUnit(input.UnitId, { bypassCache: true });
        },
      };
    },
    dataPersistOptions<UnitRolesState, Pick<UnitRolesData, 'roles' | 'rolesByUnit' | 'assignmentsByUnit' | 'fetchedAt'>>({
      name: 'omni-unit-roles-storage',
      partialize: (state) => ({ roles: state.roles, rolesByUnit: state.rolesByUnit, assignmentsByUnit: state.assignmentsByUnit, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-unit-roles-storage', useUnitRolesStore);
registerDataStoreReset<UnitRolesState>('unit-roles', useUnitRolesStore, initialData, () => runner.invalidate());
