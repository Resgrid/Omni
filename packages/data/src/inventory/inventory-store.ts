import { cancelInventoryCount, completeInventoryCount, getInventoryAccess, getInventoryCount, getInventoryCounts, getUnitEquipment, saveInventoryCount, startInventoryCount } from '@resgrid/api';
import {
  type InventoryApiResult,
  type InventoryCount,
  type InventoryCountDetail,
  type InventoryCountResult,
  InventoryCountStatus,
  type InventoryEquipment,
  type InventoryFieldAccess,
  type InventoryPage,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { generateDataId, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const INVENTORY_COUNT_SAVE_EVENT = 'inventory.count.save';

/** Saves of one count coalesce: the newest line set replaces queued older ones. */
export const inventoryCountCoalesceKey = (countId: string): string => `inventory-count:${countId}`;

type InventorySlice = 'access' | 'equipment' | 'count' | 'counts';

/** Recent counts kept per unit (newest first). */
export const INVENTORY_RECENT_COUNTS_MAX = 25;

/** Unit inventory for the active unit (`inventory` module). */
interface InventoryData extends SliceMeta<InventorySlice> {
  accessByUnit: Record<string, InventoryFieldAccess>;
  equipmentByUnit: Record<string, InventoryEquipment[]>;
  countsById: Record<string, InventoryCountDetail>;
  /** Recent counts of a unit's locations (`GetCounts` per location), newest snapshot first. */
  countsByUnit: Record<string, InventoryCount[]>;
  /**
   * Counted values entered on this device and not yet accepted by the server, per count then line. They survive an app
   * kill (a count can take a while on an apparatus); entries are dropped once the server holds the same value, and when
   * the count completes or is cancelled.
   */
  observedByCount: Record<string, Record<string, number>>;
  /** Completion request ids (idempotency keys), kept across retries of the same count until it completes. */
  completionIdByCount: Record<string, string>;
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
  /** Recent counts of the unit's locations (only people who may count see them). */
  fetchCounts: (unitId: number | string, locationIds: readonly string[], options?: FetchOptions) => Promise<void>;
  setObserved: (countId: string, lineId: string, quantity: number) => void;
  /** Drops entered values: all of a count's, or only the given lines'. */
  clearObserved: (countId: string, lineIds?: readonly string[]) => void;
  /** The count's completion request id, created once and reused by every retry. */
  completionIdFor: (countId: string) => string;
}

const initialData = (): InventoryData => ({
  ...emptySliceMeta<InventorySlice>(),
  accessByUnit: {},
  equipmentByUnit: {},
  countsById: {},
  countsByUnit: {},
  observedByCount: {},
  completionIdByCount: {},
  actionError: null,
});

const bodyCountId = (body: Record<string, unknown>): string | null => (typeof body.CountId === 'string' && body.CountId !== '' ? body.CountId : null);

const withoutKey = <T>(record: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
};

/** Drops entered values the server now holds (after a save is accepted); values changed since stay pending. */
export const settleObserved = (observedByCount: Record<string, Record<string, number>>, countId: string, detail: InventoryCountDetail): Record<string, Record<string, number>> => {
  const observed = observedByCount[countId];
  if (!observed) return observedByCount;
  const remaining = Object.fromEntries(Object.entries(observed).filter(([lineId, quantity]) => detail.Lines.find((line) => line.Id === lineId)?.CountedQuantity !== quantity));
  if (Object.keys(remaining).length === 0) return withoutKey(observedByCount, countId);
  return { ...observedByCount, [countId]: remaining };
};

/** Newest snapshot first; rows without a snapshot time last. */
const byNewestSnapshot = (a: InventoryCount, b: InventoryCount): number => String(b.SnapshotOn ?? '').localeCompare(String(a.SnapshotOn ?? ''));

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
            (detail, state) =>
              detail
                ? {
                    countsById: { ...state.countsById, [countId]: detail },
                    // A count that left Draft (completed, cancelled, awaiting a witness elsewhere) takes no more entries.
                    ...(detail.Count.Status === InventoryCountStatus.Draft ? {} : { observedByCount: withoutKey(state.observedByCount, countId) }),
                  }
                : {},
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
            const result = dataOf(assertV4Success(await completeInventoryCount(ctx(), body)));
            const countId = bodyCountId(body);
            // Done on the server (posted, or held for a witness): nothing entered here is pending any more.
            if (countId) set((state) => ({ observedByCount: withoutKey(state.observedByCount, countId), completionIdByCount: withoutKey(state.completionIdByCount, countId) }));
            return result;
          } catch (error) {
            set({ actionError: toDataError(error) });
            return null;
          }
        },
        cancelCount: async (body) => {
          set({ actionError: null });
          try {
            assertV4Success(await cancelInventoryCount(ctx(), body));
            const countId = bodyCountId(body);
            if (countId) {
              const cancelled = (count: InventoryCount): InventoryCount => (count.Id === countId ? { ...count, Status: InventoryCountStatus.Cancelled } : count);
              set((state) => {
                const detail = state.countsById[countId];
                return {
                  countsById: detail ? { ...state.countsById, [countId]: { ...detail, Count: cancelled(detail.Count) } } : state.countsById,
                  countsByUnit: Object.fromEntries(Object.entries(state.countsByUnit).map(([unitId, counts]) => [unitId, counts.map(cancelled)])),
                  observedByCount: withoutKey(state.observedByCount, countId),
                  completionIdByCount: withoutKey(state.completionIdByCount, countId),
                };
              });
            }
            return true;
          } catch (error) {
            set({ actionError: toDataError(error) });
            return false;
          }
        },
        fetchCounts: async (unitId, locationIds) => {
          const ids = [...new Set(locationIds.filter((id) => id !== ''))];
          await runner.run(
            'counts',
            async () => {
              // The API types GetCounts loosely (UnknownV4Result); its Data is one page of counts.
              const pageOf = async (locationId: string): Promise<InventoryCount[]> => {
                const page = unwrapItem(await getInventoryCounts(ctx(), { page: 0, locationId })) as InventoryPage<InventoryCount> | null;
                return Array.isArray(page?.Items) ? page.Items : [];
              };
              const pages = await Promise.all(ids.map(pageOf));
              const unique = new Map<string, InventoryCount>();
              pages.flat().forEach((count) => unique.set(count.Id, count));
              return [...unique.values()].sort(byNewestSnapshot).slice(0, INVENTORY_RECENT_COUNTS_MAX);
            },
            (counts, state) => ({ countsByUnit: { ...state.countsByUnit, [String(unitId)]: counts } }),
            { flightKey: `counts:${unitId}` }
          );
        },
        setObserved: (countId, lineId, quantity) => set((state) => ({ observedByCount: { ...state.observedByCount, [countId]: { ...(state.observedByCount[countId] ?? {}), [lineId]: quantity } } })),
        clearObserved: (countId, lineIds) =>
          set((state) => {
            if (!lineIds) return { observedByCount: withoutKey(state.observedByCount, countId) };
            const remaining = { ...(state.observedByCount[countId] ?? {}) };
            lineIds.forEach((lineId) => delete remaining[lineId]);
            return { observedByCount: Object.keys(remaining).length > 0 ? { ...state.observedByCount, [countId]: remaining } : withoutKey(state.observedByCount, countId) };
          }),
        completionIdFor: (countId) => {
          const existing = get().completionIdByCount[countId];
          if (existing) return existing;
          const id = generateDataId();
          set((state) => ({ completionIdByCount: { ...state.completionIdByCount, [countId]: id } }));
          return id;
        },
      };
    },
    dataPersistOptions<InventoryState, Pick<InventoryData, 'accessByUnit' | 'equipmentByUnit' | 'countsById' | 'countsByUnit' | 'observedByCount' | 'completionIdByCount' | 'fetchedAt'>>({
      name: 'omni-inventory-storage',
      partialize: (state) => ({
        accessByUnit: state.accessByUnit,
        equipmentByUnit: state.equipmentByUnit,
        countsById: state.countsById,
        countsByUnit: state.countsByUnit,
        observedByCount: state.observedByCount,
        completionIdByCount: state.completionIdByCount,
        fetchedAt: state.fetchedAt,
      }),
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
    if (detail) useInventoryStore.setState((state) => ({ countsById: { ...state.countsById, [event.payload.countId]: detail }, observedByCount: settleObserved(state.observedByCount, event.payload.countId, detail) }));
  },
});
