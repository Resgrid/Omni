import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Canonical records routes for every variant (omni-variants skill: `/records/*`). The home lives in each variant's
 * (app) group; the rest are stack screens above it. Ids pass `isSafeRouteId` so a value from a push payload or a
 * server row can never build a path outside the records tree.
 */
export const RECORD_ROUTE_PATTERNS = {
  home: '/records',
  new: '/records/new',
  detail: '/records/[id]',
  deployments: '/records/deployments',
  deployment: '/records/deployments/[id]',
  connectors: '/records/connectors',
  connector: '/records/connectors/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe records route id');
  return encodeURIComponent(id);
};

export const recordRoutes = {
  recordsHome: (): string => '/records',
  /** New record; `draft` resumes a draft staged on this device. */
  recordNew: (draft?: string): string => (draft ? `/records/new?draft=${encodeId(draft)}` : '/records/new'),
  recordDetail: (id: string): string => `/records/${encodeId(id)}`,
  recordDeployments: (): string => '/records/deployments',
  recordDeployment: (orderId: string): string => `/records/deployments/${encodeId(orderId)}`,
  recordConnectors: (): string => '/records/connectors',
  recordConnector: (connectorId: string): string => `/records/connectors/${encodeId(connectorId)}`,
} as const;

export const { recordsHome, recordNew, recordDetail, recordDeployments, recordDeployment, recordConnectors, recordConnector } = recordRoutes;
