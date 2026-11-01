import { acceptWorkOrderAssignment, addWorkOrderComment, addWorkOrderLabor, getReadinessAccess, getWorkOrder, getWorkOrderChoices, newWorkOrder, setWorkOrderStatus } from '@resgrid/api';
import type { ReadinessAccess, WorkOrderApiResult, WorkOrderChoices, WorkOrderDetail, WorkOrderInput, WorkOrderTransition } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const WORK_ORDER_REPORT_EVENT = 'workOrders.report';

type WorkOrdersSlice = 'access' | 'choices' | 'detail';

/**
 * Readiness work orders (Responder). TODO(api): the work order list (`GetWorkOrders`) is not in @resgrid/api
 * yet; screens open orders by id from push/inbox links until it is.
 */
interface WorkOrdersData extends SliceMeta<WorkOrdersSlice> {
  access: ReadinessAccess | null;
  choices: WorkOrderChoices | null;
  ordersById: Record<string, WorkOrderDetail>;
  /** Reports queued on this device (RequestId = idempotency key). */
  queuedReports: Record<string, { localId: string; input: WorkOrderInput; createdAt: number; state: 'queued' | 'rejected' }>;
  actionError: DataError | null;
}

export interface WorkOrdersState extends WorkOrdersData {
  fetchAccess: (options?: FetchOptions) => Promise<void>;
  fetchChoices: (options?: FetchOptions) => Promise<void>;
  fetchWorkOrder: (id: string, options?: FetchOptions) => Promise<WorkOrderDetail | null>;
  /** Offline-capable work-order report (plan §8.5 Responder): `RequestId` makes a retried create return the same order. */
  report: (input: Omit<WorkOrderInput, 'RequestId'>) => Promise<WriteResult>;
  transition: (id: string, input: WorkOrderTransition) => Promise<boolean>;
  accept: (id: string, revision: number) => Promise<boolean>;
  comment: (id: string, revision: number, note: string) => Promise<boolean>;
  logHours: (id: string, input: Record<string, unknown>) => Promise<boolean>;
  setQueuedReportState: (localId: string, state: 'queued' | 'rejected' | null, input?: WorkOrderInput, createdAt?: number) => void;
}

const initialData = (): WorkOrdersData => ({ ...emptySliceMeta<WorkOrdersSlice>(), access: null, choices: null, ordersById: {}, queuedReports: {}, actionError: null });

let runner: SliceRunner<WorkOrdersSlice, WorkOrdersState>;

export const useWorkOrdersStore = create<WorkOrdersState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<WorkOrdersSlice, WorkOrdersState>('work-orders', set);
      const ctx = () => getDataApiContext();
      const keep = (detail: WorkOrderDetail | null) => {
        if (detail) set((state) => ({ ordersById: { ...state.ordersById, [detail.Order.Id]: detail } }));
      };
      const act = async (fn: () => Promise<WorkOrderApiResult<WorkOrderDetail>>): Promise<boolean> => {
        set({ actionError: null });
        try {
          keep(unwrapItem(assertV4Success(await fn())));
          return true;
        } catch (error) {
          set({ actionError: toDataError(error) });
          return false;
        }
      };
      return {
        ...initialData(),
        fetchAccess: async () => {
          await runner.run(
            'access',
            async () => unwrapItem(await getReadinessAccess(ctx())),
            (access) => ({ access })
          );
        },
        fetchChoices: async () => {
          await runner.run(
            'choices',
            async () => unwrapItem(await getWorkOrderChoices(ctx())),
            (choices) => ({ choices })
          );
        },
        fetchWorkOrder: async (id, options) => {
          const cached = get().ordersById[id];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getWorkOrder(ctx(), { id })),
            (detail, state) => (detail ? { ordersById: { ...state.ordersById, [id]: detail } } : {}),
            {
              flightKey: `detail:${id}`,
            }
          );
          return result.ok ? result.value : (cached ?? null);
        },
        report: (input) => submitWrite<Omit<WorkOrderInput, 'RequestId'>>({ type: WORK_ORDER_REPORT_EVENT, payload: input }),
        transition: (id, input) => act(() => setWorkOrderStatus(ctx(), { Id: id, Input: input })),
        accept: (id, revision) => act(() => acceptWorkOrderAssignment(ctx(), { Id: id, Revision: revision })),
        comment: (id, revision, note) => act(() => addWorkOrderComment(ctx(), { Id: id, Revision: revision, Note: note })),
        logHours: (id, input) => act(() => addWorkOrderLabor(ctx(), { Id: id, Input: input })),
        setQueuedReportState: (localId, reportState, input, createdAt) =>
          set((state) => {
            const queuedReports = { ...state.queuedReports };
            const existing = queuedReports[localId];
            if (reportState === null) delete queuedReports[localId];
            else if (existing) queuedReports[localId] = { ...existing, state: reportState };
            else if (input) queuedReports[localId] = { localId, input, createdAt: createdAt ?? 0, state: reportState };
            return { queuedReports };
          }),
      };
    },
    dataPersistOptions<WorkOrdersState, Pick<WorkOrdersData, 'access' | 'choices' | 'ordersById' | 'queuedReports' | 'fetchedAt'>>({
      name: 'omni-work-orders-storage',
      partialize: (state) => ({ access: state.access, choices: state.choices, ordersById: state.ordersById, queuedReports: state.queuedReports, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-work-orders-storage', useWorkOrdersStore);
registerDataStoreReset<WorkOrdersState>('work-orders', useWorkOrdersStore, initialData, () => runner.invalidate());

export const workOrderReportHandler = defineDataHandler<Omit<WorkOrderInput, 'RequestId'>, WorkOrderApiResult<WorkOrderDetail>>({
  type: WORK_ORDER_REPORT_EVENT,
  optimisticApply: (event) => useWorkOrdersStore.getState().setQueuedReportState(event.id, 'queued', { ...event.payload, RequestId: event.id }, event.createdAt),
  send: async (event, context) => assertV4Success(await newWorkOrder(getDataApiContext(), { ...event.payload, RequestId: context.idempotencyKey })),
  afterAck: (event, result) => {
    useWorkOrdersStore.getState().setQueuedReportState(event.id, null);
    const detail = result?.Data ?? null;
    if (detail) useWorkOrdersStore.setState((state) => ({ ordersById: { ...state.ordersById, [detail.Order.Id]: detail } }));
  },
  rollback: (event, reason) => useWorkOrdersStore.getState().setQueuedReportState(event.id, reason === 'discarded' ? null : 'rejected'),
});
