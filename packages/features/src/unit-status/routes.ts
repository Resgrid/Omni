/** Unit status console routes. The console also lives in the shell sidebar (`shell.sidebarContent: "unit-status"`). */
export const UNIT_STATUS_ROUTE_PATTERNS = {
  console: '/console',
} as const;

export const unitStatusRoutes = {
  console: (): string => '/console',
} as const;
