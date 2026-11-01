/**
 * Run cards have no screens of their own (Dispatch baseline: they live inside New Call, call detail and the console),
 * so they contribute no routes. The call routes they link to come from `@resgrid/features/calls`.
 */
export const RUNCARDS_ROUTE_PATTERNS = {} as const;

export const runcardsRoutes = {} as const;
