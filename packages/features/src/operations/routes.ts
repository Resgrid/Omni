import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Deployment (operations) routes, the same in every variant that ships them: `/operations` lists the deployments the
 * person may see, `/operations/[id]` opens one (time, expenses, usage, F-42). Ids pass `isSafeRouteId`; a refused id
 * builds no path (null, reported).
 */
export const OPERATIONS_ROUTE_PATTERNS = {
  list: '/operations',
  deployment: '/operations/[id]',
} as const;

export const operationsRoutes = {
  operationsList: (): string => '/operations',
  operationsDeployment: (id: string): string | null => routePathWithId('operations.deployment', id, (deploymentId) => `/operations/${deploymentId}`),
} as const;

export const { operationsList, operationsDeployment } = operationsRoutes;
