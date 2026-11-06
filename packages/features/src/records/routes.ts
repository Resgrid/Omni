import { routePathWithId, routePathWithQuery } from '@resgrid/core/navigation/route-paths';

/**
 * Canonical records routes for every variant (omni-variants skill: `/records/*`). The home lives in each variant's
 * (app) group; the rest are stack screens above it. Ids pass `isSafeRouteId` so a value from a push payload or a
 * server row can never build a path outside the records tree; a refused id builds no path (null, reported).
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

export const recordRoutes = {
  recordsHome: (): string => '/records',
  /** New record; `draft` resumes a draft staged on this device. */
  recordNew: (draft?: string): string | null => routePathWithQuery('records.new', '/records/new', { draft }),
  recordDetail: (id: string): string | null => routePathWithId('records.detail', id, (recordId) => `/records/${recordId}`),
  recordDeployments: (): string => '/records/deployments',
  recordDeployment: (orderId: string): string | null => routePathWithId('records.deployment', orderId, (id) => `/records/deployments/${id}`),
  recordConnectors: (): string => '/records/connectors',
  recordConnector: (connectorId: string): string | null => routePathWithId('records.connector', connectorId, (id) => `/records/connectors/${id}`),
} as const;

export const { recordsHome, recordNew, recordDetail, recordDeployments, recordDeployment, recordConnectors, recordConnector } = recordRoutes;
