/** The Awaiting Resources screen (Dispatch). The calls it links to use `@resgrid/features/calls` routes. */
export const AWAITING_RESOURCES_ROUTE_PATTERNS = {
  list: '/awaiting-resources',
} as const;

export const awaitingResourcesRoutes = {
  list: (): string => '/awaiting-resources',
} as const;
