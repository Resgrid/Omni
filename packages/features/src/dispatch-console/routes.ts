/**
 * The Dispatch console is the variant's home (`/`, the `(app)` index; the legacy `/home`). Its links go to other
 * features' routes (`/call/[id]`, `/pending-calls`, `/units/[id]`, …) and the canonical department map (`/map`).
 */
export const DISPATCH_CONSOLE_ROUTE_PATTERNS = {
  home: '/',
  map: '/map',
} as const;

export const dispatchConsoleRoutes = {
  home: (): string => '/',
  map: (): string => '/map',
} as const;
