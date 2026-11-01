/** The Dispatch queue screens (legacy Dispatch routes, kept). Rows link to `/call/[id]` from `@resgrid/features/calls`. */
export const CALL_QUEUES_ROUTE_PATTERNS = {
  pending: '/pending-calls',
  scheduled: '/scheduled-calls',
  archived: '/archived-calls',
} as const;

export const callQueuesRoutes = {
  pending: (): string => '/pending-calls',
  scheduled: (): string => '/scheduled-calls',
  archived: (): string => '/archived-calls',
} as const;
