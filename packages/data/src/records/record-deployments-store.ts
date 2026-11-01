import {
  getRecordDeployment,
  getRecordDeploymentConnector,
  getRecordDeploymentConnectorRuns,
  getRecordDeploymentConnectors,
  getRecordDeploymentReconciliation,
  getRecordDeployments,
  runRecordDeploymentConnector,
} from '@resgrid/api';
import type { RecordDeploymentConnectorData, RecordDeploymentConnectorRunData, RecordDeploymentData, RecordDeploymentReconciliationData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type SliceMeta, type SliceRunner } from '../core/slices';

type DeploymentsSlice = 'deployments' | 'deployment' | 'reconciliation' | 'connectors' | 'connector' | 'runs';

/**
 * RMS deployments and ordering-system connectors (RMS plan §4.1). The server owns every list and decision;
 * the only command is "read the feed now". A refusal (403/404) is an answer about access, never retried.
 */
interface RecordDeploymentsData extends SliceMeta<DeploymentsSlice> {
  deployments: RecordDeploymentData[];
  includeClosed: boolean;
  reconciliation: RecordDeploymentReconciliationData[];
  connectors: RecordDeploymentConnectorData[];
  runs: Record<string, RecordDeploymentConnectorRunData[]>;
  runningConnectorId: string | null;
  runError: DataError | null;
}

export interface RecordDeploymentsState extends RecordDeploymentsData {
  fetchDeployments: (options?: { includeClosed?: boolean }) => Promise<RecordDeploymentData[]>;
  fetchDeployment: (orderId: string) => Promise<RecordDeploymentData | null>;
  fetchReconciliation: (connectorId: string) => Promise<RecordDeploymentReconciliationData[]>;
  fetchConnectors: () => Promise<RecordDeploymentConnectorData[]>;
  fetchConnector: (connectorId: string) => Promise<RecordDeploymentConnectorData | null>;
  fetchRuns: (connectorId: string) => Promise<RecordDeploymentConnectorRunData[]>;
  runConnector: (connectorId: string) => Promise<boolean>;
}

const initialData = (): RecordDeploymentsData => ({
  ...emptySliceMeta<DeploymentsSlice>(),
  deployments: [],
  includeClosed: false,
  reconciliation: [],
  connectors: [],
  runs: {},
  runningConnectorId: null,
  runError: null,
});

const upsertDeployment = (list: RecordDeploymentData[], deployment: RecordDeploymentData): RecordDeploymentData[] => [deployment, ...list.filter((existing) => existing.OrderId !== deployment.OrderId)];

let runner: SliceRunner<DeploymentsSlice, RecordDeploymentsState>;

export const useRecordDeploymentsStore = create<RecordDeploymentsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<DeploymentsSlice, RecordDeploymentsState>('record-deployments', set);
      const ctx = () => getDataApiContext();
      return {
        ...initialData(),
        fetchDeployments: async (options) => {
          const includeClosed = options?.includeClosed ?? get().includeClosed;
          const result = await runner.run(
            'deployments',
            async () => unwrapList(await getRecordDeployments(ctx(), { includeClosed })),
            (deployments) => ({ deployments, includeClosed })
          );
          return result.ok ? result.value : get().deployments;
        },
        fetchDeployment: async (orderId) => {
          const result = await runner.run(
            'deployment',
            async () => unwrapItem(await getRecordDeployment(ctx(), { id: orderId })),
            (deployment, state) => (deployment ? { deployments: upsertDeployment(state.deployments, deployment) } : {}),
            { flightKey: `deployment:${orderId}` }
          );
          return result.ok ? result.value : null;
        },
        fetchReconciliation: async (connectorId) => {
          const result = await runner.run(
            'reconciliation',
            async () => unwrapList(await getRecordDeploymentReconciliation(ctx(), { id: connectorId })),
            (reconciliation) => ({ reconciliation })
          );
          return result.ok ? result.value : [];
        },
        fetchConnectors: async () => {
          const result = await runner.run(
            'connectors',
            async () => unwrapList(await getRecordDeploymentConnectors(ctx())),
            (connectors) => ({ connectors })
          );
          return result.ok ? result.value : [];
        },
        fetchConnector: async (connectorId) => {
          const result = await runner.run(
            'connector',
            async () => unwrapItem(await getRecordDeploymentConnector(ctx(), { id: connectorId })),
            (connector, state) => (connector ? { connectors: [connector, ...state.connectors.filter((existing) => existing.Id !== connector.Id)] } : {}),
            { flightKey: `connector:${connectorId}` }
          );
          return result.ok ? result.value : null;
        },
        fetchRuns: async (connectorId) => {
          const result = await runner.run(
            'runs',
            async () => unwrapList(await getRecordDeploymentConnectorRuns(ctx(), { id: connectorId })),
            (list, state) => ({ runs: { ...state.runs, [connectorId]: list } }),
            {
              flightKey: `runs:${connectorId}`,
            }
          );
          return result.ok ? result.value : [];
        },
        runConnector: async (connectorId) => {
          set({ runningConnectorId: connectorId, runError: null });
          try {
            assertV4Success(await runRecordDeploymentConnector(ctx(), { id: connectorId }));
            set({ runningConnectorId: null });
            await get().fetchRuns(connectorId);
            return true;
          } catch (error) {
            set({ runningConnectorId: null, runError: toDataError(error) });
            return false;
          }
        },
      };
    },
    dataPersistOptions<RecordDeploymentsState, Pick<RecordDeploymentsData, 'deployments' | 'includeClosed' | 'fetchedAt'>>({
      // Frozen legacy name. Connector rows and run logs carry feed roots and source messages: never written to the device.
      name: 'records-deployments-storage',
      partialize: (state) => ({ deployments: state.deployments, includeClosed: state.includeClosed, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('records-deployments-storage', useRecordDeploymentsStore);
registerDataStoreReset<RecordDeploymentsState>('record-deployments', useRecordDeploymentsStore, initialData, () => runner.invalidate());
