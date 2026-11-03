import { PENDING_CALLS_ROUTE } from '@resgrid/features/calls';

/** The Dispatch queue screens (legacy Dispatch routes, kept). Rows link to `/call/[id]` from `@resgrid/features/calls`. */
export const CALL_QUEUES_ROUTE_PATTERNS = {
  pending: PENDING_CALLS_ROUTE,
  scheduled: '/scheduled-calls',
  archived: '/archived-calls',
} as const;

export const callQueuesRoutes = {
  pending: (): string => PENDING_CALLS_ROUTE,
  scheduled: (): string => '/scheduled-calls',
  archived: (): string => '/archived-calls',
} as const;
