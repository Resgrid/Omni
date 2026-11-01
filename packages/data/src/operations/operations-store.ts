import {
  addResourceUsage,
  approveTimeReport,
  deleteExpense,
  getDeployment,
  getDeploymentByCallId,
  getDeployments,
  getDeploymentsAccess,
  getExpenses,
  getFieldCostAccess,
  getResourceUsage,
  getTimeReports,
  newTimeReport,
  saveExpense,
  saveTimeEntries,
  signTimeReport,
  submitTimeReport,
} from '@resgrid/api';
import type {
  AddResourceUsageInput,
  Deployment,
  DeploymentAccess,
  Expense,
  FieldCostAccess,
  NewTimeReportInput,
  OperationsResult,
  ResourceUsage,
  SaveExpenseInput,
  SaveTimeEntriesInput,
  SignTimeReportInput,
  TimeReport,
  TimeReportResponse,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const TIME_ENTRIES_SAVE_EVENT = 'operations.timeEntries.save';
export const EXPENSE_SAVE_EVENT = 'operations.expense.save';

/** Entries of one time report replace each other in order (newest wins). */
export const timeReportCoalesceKey = (timeReportId: string): string => `time-report:${timeReportId}`;

type OperationsSlice = 'access' | 'costAccess' | 'deployments' | 'deployment' | 'timeReports' | 'expenses' | 'usage';

interface OperationsData extends SliceMeta<OperationsSlice> {
  access: DeploymentAccess | null;
  costAccess: FieldCostAccess | null;
  deployments: Deployment[];
  deploymentsById: Record<string, Deployment>;
  /** Deployment id per call (incident) for the call screens. */
  deploymentIdByCall: Record<string, string>;
  timeReportsByDeployment: Record<string, TimeReport[]>;
  expensesByDeployment: Record<string, Expense[]>;
  usageByDeployment: Record<string, ResourceUsage[]>;
  actionError: DataError | null;
}

export interface OperationsState extends OperationsData {
  loadAccess: (options?: FetchOptions) => Promise<void>;
  loadDeployments: (includeClosed?: boolean, options?: FetchOptions) => Promise<void>;
  loadDeployment: (deploymentId: string, options?: FetchOptions) => Promise<void>;
  loadDeploymentForCall: (callId: number, options?: FetchOptions) => Promise<void>;
  loadTimeReports: (deploymentId: string, options?: FetchOptions) => Promise<void>;
  loadExpenses: (deploymentId: string, options?: FetchOptions) => Promise<void>;
  loadUsage: (deploymentId: string, options?: FetchOptions) => Promise<void>;
  /** Online: the server issues the report number. */
  openTimeReport: (input: NewTimeReportInput) => Promise<TimeReport | null>;
  /** Offline-capable crew time entries (Unit scope); newer saves of the same report replace queued ones. */
  saveTimeEntries: (deploymentId: string, input: SaveTimeEntriesInput) => Promise<WriteResult>;
  /** Offline-capable expense (Unit scope). */
  addExpense: (deploymentId: string, input: SaveExpenseInput) => Promise<WriteResult>;
  // Legal steps are online only: signature and approval need the server's answer.
  submitTimeReport: (reportId: string, deploymentId: string) => Promise<boolean>;
  signTimeReport: (input: SignTimeReportInput, deploymentId: string) => Promise<boolean>;
  approveTimeReport: (reportId: string, deploymentId: string) => Promise<boolean>;
  removeExpense: (expenseId: string, deploymentId: string) => Promise<boolean>;
  addUsage: (input: AddResourceUsageInput) => Promise<boolean>;
}

const initialData = (): OperationsData => ({
  ...emptySliceMeta<OperationsSlice>(),
  access: null,
  costAccess: null,
  deployments: [],
  deploymentsById: {},
  deploymentIdByCall: {},
  timeReportsByDeployment: {},
  expensesByDeployment: {},
  usageByDeployment: {},
  actionError: null,
});

/** A TimeReportResponse carries validation errors in `Errors`; any error is a refusal. */
const assertTimeReport = (response: TimeReportResponse): TimeReportResponse => {
  assertV4Success(response);
  if (response.Errors && response.Errors.length > 0) throw Object.assign(new Error('Time report refused'), { response: { status: 422 } });
  return response;
};

let runner: SliceRunner<OperationsSlice, OperationsState>;

export const useOperationsStore = create<OperationsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<OperationsSlice, OperationsState>('operations', set);
      const ctx = () => getDataApiContext();
      const act = async (fn: () => Promise<void>): Promise<boolean> => {
        set({ actionError: null });
        try {
          await fn();
          return true;
        } catch (error) {
          set({ actionError: toDataError(error) });
          return false;
        }
      };
      const perDeployment =
        <T>(slice: OperationsSlice, field: 'timeReportsByDeployment' | 'expensesByDeployment' | 'usageByDeployment', load: (deploymentId: string) => Promise<OperationsResult<T[]>>) =>
        async (deploymentId: string): Promise<void> => {
          await runner.run(
            slice,
            async () => unwrapList(await load(deploymentId)),
            (list, state) => ({ [field]: { ...state[field], [deploymentId]: list } }) as Partial<OperationsState>,
            {
              flightKey: `${slice}:${deploymentId}`,
            }
          );
        };

      return {
        ...initialData(),

        loadAccess: async () => {
          await Promise.all([
            runner.run(
              'access',
              async () => unwrapItem(await getDeploymentsAccess(ctx())),
              (access) => ({ access })
            ),
            runner.run(
              'costAccess',
              async () => unwrapItem(await getFieldCostAccess(ctx())),
              (costAccess) => ({ costAccess })
            ),
          ]);
        },
        loadDeployments: async (includeClosed) => {
          await runner.run(
            'deployments',
            async () => unwrapList(await getDeployments(ctx(), { active: includeClosed ? undefined : true })),
            (deployments) => ({ deployments })
          );
        },
        loadDeployment: async (deploymentId) => {
          await runner.run(
            'deployment',
            async () => unwrapItem(await getDeployment(ctx(), { id: deploymentId })),
            (deployment, state) => (deployment ? { deploymentsById: { ...state.deploymentsById, [deploymentId]: deployment } } : {}),
            { flightKey: `deployment:${deploymentId}` }
          );
        },
        loadDeploymentForCall: async (callId) => {
          await runner.run(
            'deployment',
            async () => unwrapItem(await getDeploymentByCallId(ctx(), { callId })),
            (deployment, state) => (deployment ? { deploymentsById: { ...state.deploymentsById, [deployment.Id]: deployment }, deploymentIdByCall: { ...state.deploymentIdByCall, [String(callId)]: deployment.Id } } : {}),
            { flightKey: `call:${callId}` }
          );
        },
        loadTimeReports: perDeployment('timeReports', 'timeReportsByDeployment', (deploymentId) => getTimeReports(ctx(), { deploymentId })),
        loadExpenses: perDeployment('expenses', 'expensesByDeployment', (deploymentId) => getExpenses(ctx(), { deploymentId })),
        loadUsage: perDeployment('usage', 'usageByDeployment', (deploymentId) => getResourceUsage(ctx(), { deploymentId })),

        openTimeReport: async (input) => {
          let report: TimeReport | null = null;
          await act(async () => {
            report = unwrapItem(assertTimeReport(await newTimeReport(ctx(), input)));
            if (input.DeploymentId) await get().loadTimeReports(input.DeploymentId);
          });
          return report;
        },
        saveTimeEntries: (deploymentId, input) =>
          submitWrite<OperationsWritePayload<SaveTimeEntriesInput>>({
            type: TIME_ENTRIES_SAVE_EVENT,
            payload: { deploymentId, input },
            ...(input.TimeReportId ? { coalesceKey: timeReportCoalesceKey(input.TimeReportId) } : {}),
          }),
        addExpense: (deploymentId, input) => submitWrite<OperationsWritePayload<SaveExpenseInput>>({ type: EXPENSE_SAVE_EVENT, payload: { deploymentId, input } }),
        submitTimeReport: (reportId, deploymentId) =>
          act(async () => {
            assertTimeReport(await submitTimeReport(ctx(), { Id: reportId }));
            await get().loadTimeReports(deploymentId);
          }),
        signTimeReport: (input, deploymentId) =>
          act(async () => {
            assertTimeReport(await signTimeReport(ctx(), input));
            await get().loadTimeReports(deploymentId);
          }),
        approveTimeReport: (reportId, deploymentId) =>
          act(async () => {
            assertTimeReport(await approveTimeReport(ctx(), { Id: reportId }));
            await get().loadTimeReports(deploymentId);
          }),
        removeExpense: (expenseId, deploymentId) =>
          act(async () => {
            assertV4Success(await deleteExpense(ctx(), { id: expenseId }));
            set((state) => ({ expensesByDeployment: { ...state.expensesByDeployment, [deploymentId]: (state.expensesByDeployment[deploymentId] ?? []).filter((expense) => expense.Id !== expenseId) } }));
          }),
        addUsage: (input) =>
          act(async () => {
            assertV4Success(await addResourceUsage(ctx(), input));
            if (input.DeploymentId) await get().loadUsage(input.DeploymentId);
          }),
      };
    },
    dataPersistOptions<OperationsState, Pick<OperationsData, 'access' | 'deployments' | 'deploymentsById' | 'deploymentIdByCall' | 'timeReportsByDeployment' | 'expensesByDeployment' | 'fetchedAt'>>({
      name: 'omni-operations-storage',
      partialize: (state) => ({
        access: state.access,
        deployments: state.deployments,
        deploymentsById: state.deploymentsById,
        deploymentIdByCall: state.deploymentIdByCall,
        timeReportsByDeployment: state.timeReportsByDeployment,
        expensesByDeployment: state.expensesByDeployment,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-operations-storage', useOperationsStore);
registerDataStoreReset<OperationsState>('operations', useOperationsStore, initialData, () => runner.invalidate());

export interface OperationsWritePayload<T> {
  deploymentId: string;
  input: T;
}

export const timeEntriesSaveHandler = defineDataHandler<OperationsWritePayload<SaveTimeEntriesInput>, TimeReportResponse>({
  type: TIME_ENTRIES_SAVE_EVENT,
  send: async (event) => assertTimeReport(await saveTimeEntries(getDataApiContext(), event.payload.input)),
  afterAck: (event) => useOperationsStore.getState().loadTimeReports(event.payload.deploymentId, { bypassCache: true }),
});

export const expenseSaveHandler = defineDataHandler<OperationsWritePayload<SaveExpenseInput>, OperationsResult<Expense>>({
  type: EXPENSE_SAVE_EVENT,
  send: async (event) => assertV4Success(await saveExpense(getDataApiContext(), event.payload.input)),
  afterAck: (event) => useOperationsStore.getState().loadExpenses(event.payload.deploymentId, { bypassCache: true }),
});
