import { cancelInventoryCount, completeInventoryCount, getInventoryAccess, getInventoryCount, getUnitEquipment, saveInventoryCount, startInventoryCount } from '@resgrid/api';
import type { InventoryApiResult, InventoryCountDetail, InventoryCountResult, InventoryEquipment, InventoryFieldAccess } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const INVENTORY_COUNT_SAVE_EVENT = 'inventory.count.save';

/** Saves of one count coalesce: the newest line set replaces queued older ones. */
export const inventoryCountCoalesceKey = (countId: string): string => `inventory-count:${countId}`;

type InventorySlice = 'access' | 'equipment' | 'count';

/** Unit inventory for the active unit (`inventory` module). */
interface InventoryData extends SliceMeta<InventorySlice> {
  accessByUnit: Record<string, InventoryFieldAccess>;
  equipmentByUnit: Record<string, InventoryEquipment[]>;
  countsById: Record<string, InventoryCountDetail>;
  actionError: DataError | null;
}

export interface InventoryCountSavePayload {
  countId: string;
  body: Record<string, unknown>;
}

export interface InventoryState extends InventoryData {
  fetchAccess: (unitId: number | string, options?: FetchOptions) => Promise<void>;
  fetchEquipment: (unitId: number | string, options?: FetchOptions) => Promise<void>;
  fetchCount: (countId: string, options?: FetchOptions) => Promise<InventoryCountDetail | null>;
  /** Online: the server snapshots expected quantities. */
  startCount: (body: Record<string, unknown>) => Promise<InventoryCountDetail | null>;
  /** Offline-capable line counts (Unit scope). */
  saveCount: (countId: string, body: Record<string, unknown>) => Promise<WriteResult>;
  /** Online: completion posts the variances (a controlled-substance variance awaits a witness). */
  completeCount: (body: Record<string, unknown>) => Promise<InventoryCountResult | null>;
  cancelCount: (body: Record<string, unknown>) => Promise<boolean>;
}

const initialData = (): InventoryData => ({ ...emptySliceMeta<InventorySlice>(), accessByUnit: {}, equipmentByUnit: {}, countsById: {}, actionError: null });

const dataOf = <T>(result: InventoryApiResult<T>): T | null => unwrapItem<T>(result);

let runner: SliceRunner<InventorySlice, InventoryState>;

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<InventorySlice, InventoryState>('inventory', set);
      const ctx = () => getDataApiContext();
      const keepCount = (detail: InventoryCountDetail | null) => {
        if (detail?.Count?.Id) set((state) => ({ countsById: { ...state.countsById, [detail.Count.Id]: detail } }));
        return detail;
      };
      return {
        ...initialData(),
        fetchAccess: async (unitId) => {
          await runner.run(
            'access',
            async () => dataOf(await getInventoryAccess(ctx(), { unitId })),
            (access, state) => (access ? { accessByUnit: { ...state.accessByUnit, [String(unitId)]: access } } : {}),
            {
              flightKey: `access:${unitId}`,
            }
          );
        },
        fetchEquipment: async (unitId) => {
          await runner.run(
            'equipment',
            async () => unwrapList(await getUnitEquipment(ctx(), { unitId })),
            (list, state) => ({ equipmentByUnit: { ...state.equipmentByUnit, [String(unitId)]: list } }),
            {
              flightKey: `equipment:${unitId}`,
            }
          );
        },
        fetchCount: async (countId, options) => {
          const cached = get().countsById[countId];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'count',
            async () => dataOf(await getInventoryCount(ctx(), { id: countId })),
            (detail, state) => (detail ? { countsById: { ...state.countsById, [countId]: detail } } : {}),
            {
              flightKey: `count:${countId}`,
            }
          );
          return result.ok ? result.value : (cached ?? null);
        },
        startCount: async (body) => {
          set({ actionError: null });
          try {
            return keepCount(dataOf(assertV4Success(await startInventoryCount(ctx(), body))));
          } catch (error) {
            set({ actionError: toDataError(error) });
            return null;
          }
        },
        saveCount: (countId, body) => submitWrite<InventoryCountSavePayload>({ type: INVENTORY_COUNT_SAVE_EVENT, payload: { countId, body }, coalesceKey: inventoryCountCoalesceKey(countId) }),
        completeCount: async (body) => {
          set({ actionError: null });
          try {
            return dataOf(assertV4Success(await completeInventoryCount(ctx(), body)));
          } catch (error) {
            set({ actionError: toDataError(error) });
            return null;
          }
        },
        cancelCount: async (body) => {
          set({ actionError: null });
          try {
            assertV4Success(await cancelInventoryCount(ctx(), body));
            return true;
          } catch (error) {
            set({ actionError: toDataError(error) });
            return false;
          }
        },
      };
    },
    dataPersistOptions<InventoryState, Pick<InventoryData, 'accessByUnit' | 'equipmentByUnit' | 'countsById' | 'fetchedAt'>>({
      name: 'omni-inventory-storage',
      partialize: (state) => ({ accessByUnit: state.accessByUnit, equipmentByUnit: state.equipmentByUnit, countsById: state.countsById, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-inventory-storage', useInventoryStore);
registerDataStoreReset<InventoryState>('inventory', useInventoryStore, initialData, () => runner.invalidate());

export const inventoryCountSaveHandler = defineDataHandler<InventoryCountSavePayload, InventoryApiResult<InventoryCountDetail>>({
  type: INVENTORY_COUNT_SAVE_EVENT,
  send: async (event) => assertV4Success(await saveInventoryCount(getDataApiContext(), event.payload.body)),
  afterAck: async (event, result) => {
    const detail = result?.Data ?? null;
    if (detail) useInventoryStore.setState((state) => ({ countsById: { ...state.countsById, [event.payload.countId]: detail } }));
  },
});
