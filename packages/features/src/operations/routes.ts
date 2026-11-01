import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Deployment (operations) routes, the same in every variant that ships them: `/operations` lists the deployments the
 * person may see, `/operations/[id]` opens one (time, expenses, usage, F-42). Ids pass `isSafeRouteId`.
 */
export const OPERATIONS_ROUTE_PATTERNS = {
  list: '/operations',
  deployment: '/operations/[id]',
} as const;

export const operationsRoutes = {
  operationsList: (): string => '/operations',
  operationsDeployment: (id: string): string => {
    if (!isSafeRouteId(id)) throw new Error('Unsafe operations route id');
    return `/operations/${encodeURIComponent(id)}`;
  },
} as const;

export const { operationsList, operationsDeployment } = operationsRoutes;
