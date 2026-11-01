import {
  acceptWorkOrderAssignment,
  addWorkOrderComment,
  addWorkOrderLabor,
  getReadinessAccess,
  getWorkOrder,
  getWorkOrderChoices,
  getWorkOrderImage,
  getWorkOrders,
  newWorkOrder,
  setWorkOrderStatus,
  uploadWorkOrderFile,
} from '@resgrid/api';
import type { ReadinessAccess, WorkOrderApiResult, WorkOrderChoices, WorkOrderDetail, WorkOrderInput, WorkOrderPage, WorkOrderSummary, WorkOrderTransition } from '@resgrid/models';
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

type WorkOrdersSlice = 'access' | 'choices' | 'detail' | 'list' | 'image';

/** The work order list the person last loaded (the server scopes it to what they reported or are assigned). */
export interface WorkOrderListState {
  assignedToMe: boolean;
  items: WorkOrderSummary[];
  /** Zero-based page of the last loaded page. */
  page: number;
  hasMore: boolean;
  /** The Readiness Pro write gate for this department and person (`WorkOrderPage.CanWrite`). */
  canWrite: boolean;
  /** A page was loaded this session (the list is not persisted, so after a restart offline this is false). */
  loaded: boolean;
}

/** A photo or PDF to attach (`UploadWorkOrderFile`, multipart). */
export interface WorkOrderFileUpload {
  uri: string;
  name: string;
  type: string;
}

/** Readiness work orders (Responder). Screens open orders from the list or by id from push/inbox links. */
interface WorkOrdersData extends SliceMeta<WorkOrdersSlice> {
  access: ReadinessAccess | null;
  choices: WorkOrderChoices | null;
  ordersById: Record<string, WorkOrderDetail>;
  list: WorkOrderListState;
  /** Attached images as `data:` URIs, in memory only (never persisted or written to a shared cache). */
  imagesById: Record<string, string>;
  /** Reports queued on this device (RequestId = idempotency key). */
  queuedReports: Record<string, { localId: string; input: WorkOrderInput; createdAt: number; state: 'queued' | 'rejected' }>;
  actionError: DataError | null;
}

export interface WorkOrdersState extends WorkOrdersData {
  fetchAccess: (options?: FetchOptions) => Promise<void>;
  fetchChoices: (options?: FetchOptions) => Promise<void>;
  fetchWorkOrder: (id: string, options?: FetchOptions) => Promise<WorkOrderDetail | null>;
  /** First page of the list; `assignedToMe` defaults to the filter last used. */
  fetchWorkOrders: (filter?: { assignedToMe?: boolean }, options?: FetchOptions) => Promise<void>;
  /** The next page; only extends a list that has more. */
  fetchMoreWorkOrders: () => Promise<void>;
  /** Offline-capable work-order report (plan §8.5 Responder): `RequestId` makes a retried create return the same order. */
  report: (input: Omit<WorkOrderInput, 'RequestId'>) => Promise<WriteResult>;
  transition: (id: string, input: WorkOrderTransition) => Promise<boolean>;
  accept: (id: string, revision: number) => Promise<boolean>;
  comment: (id: string, revision: number, note: string) => Promise<boolean>;
  logHours: (id: string, input: Record<string, unknown>) => Promise<boolean>;
  /** Online only: the server scans the file before anyone can open it. */
  attachFile: (id: string, revision: number, file: WorkOrderFileUpload) => Promise<boolean>;
  /** An attached image as a `data:` URI (PNG/JPEG ≤ 10 MB), cached in memory; null when it cannot be shown. */
  fetchImage: (fileId: string) => Promise<string | null>;
  setQueuedReportState: (localId: string, state: 'queued' | 'rejected' | null, input?: WorkOrderInput, createdAt?: number) => void;
}

const emptyList = (): WorkOrderListState => ({ assignedToMe: true, items: [], page: 0, hasMore: false, canWrite: false, loaded: false });

const initialData = (): WorkOrdersData => ({ ...emptySliceMeta<WorkOrdersSlice>(), access: null, choices: null, ordersById: {}, list: emptyList(), imagesById: {}, queuedReports: {}, actionError: null });

const listParams = (page: number, assignedToMe: boolean): Parameters<typeof getWorkOrders>[1] => ({ Page: page, AssignedToMe: assignedToMe });

const emptyPage = (): WorkOrderPage => ({ Items: [], HasMore: false, CanWrite: false });

let runner: SliceRunner<WorkOrdersSlice, WorkOrdersState>;

export const useWorkOrdersStore = create<WorkOrdersState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<WorkOrdersSlice, WorkOrdersState>('work-orders', set);
      const ctx = () => getDataApiContext();
      /** Every command answers with the whole detail: keep it, and keep the list row in step with it. */
      const keep = (detail: WorkOrderDetail | null) => {
        if (detail)
          set((state) => ({
            ordersById: { ...state.ordersById, [detail.Order.Id]: detail },
            list: { ...state.list, items: state.list.items.map((item) => (item.Id === detail.Order.Id ? detail.Order : item)) },
          }));
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
        fetchWorkOrders: async (filter) => {
          const assignedToMe = filter?.assignedToMe ?? get().list.assignedToMe;
          await runner.run(
            'list',
            async () => unwrapItem(await getWorkOrders(ctx(), listParams(0, assignedToMe))) ?? emptyPage(),
            (page) => ({ list: { assignedToMe, items: page.Items ?? [], page: 0, hasMore: page.HasMore === true, canWrite: page.CanWrite === true, loaded: true } }),
            { flightKey: `list:${assignedToMe ? 'mine' : 'all'}` }
          );
        },
        fetchMoreWorkOrders: async () => {
          const { list, loading } = get();
          if (!list.hasMore || loading.list === true) return;
          const next = list.page + 1;
          await runner.run(
            'list',
            async () => unwrapItem(await getWorkOrders(ctx(), listParams(next, list.assignedToMe))) ?? emptyPage(),
            (page, state) => {
              // A different filter loaded meanwhile: this page belongs to the old list.
              if (state.list.assignedToMe !== list.assignedToMe) return {};
              const known = new Set(state.list.items.map((item) => item.Id));
              const items = [...state.list.items, ...(page.Items ?? []).filter((item) => !known.has(item.Id))];
              return { list: { ...state.list, items, page: next, hasMore: page.HasMore === true } };
            },
            { flightKey: `list-more:${next}` }
          );
        },
        report: (input) => submitWrite<Omit<WorkOrderInput, 'RequestId'>>({ type: WORK_ORDER_REPORT_EVENT, payload: input }),
        transition: (id, input) => act(() => setWorkOrderStatus(ctx(), { Id: id, Input: input })),
        accept: (id, revision) => act(() => acceptWorkOrderAssignment(ctx(), { Id: id, Revision: revision })),
        comment: (id, revision, note) => act(() => addWorkOrderComment(ctx(), { Id: id, Revision: revision, Note: note })),
        logHours: (id, input) => act(() => addWorkOrderLabor(ctx(), { Id: id, Input: input })),
        attachFile: (id, revision, file) =>
          act(() => {
            const form = new FormData();
            form.append('id', id);
            form.append('revision', String(revision));
            // React Native's FormData takes a { uri, name, type } descriptor for a file part.
            form.append('file', file as unknown as Blob);
            return uploadWorkOrderFile(ctx(), form, { timeoutMs: 60_000 });
          }),
        fetchImage: async (fileId) => {
          const cached = get().imagesById[fileId];
          if (cached) return cached;
          const result = await runner.run(
            'image',
            () => getWorkOrderImage(ctx(), fileId),
            (uri, state) => ({ imagesById: { ...state.imagesById, [fileId]: uri } }),
            { flightKey: `image:${fileId}` }
          );
          return result.ok ? result.value : null;
        },
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
