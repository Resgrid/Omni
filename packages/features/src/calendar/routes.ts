/** The department calendar (Responder `/calendar`). */
export const CALENDAR_ROUTE_PATTERNS = {
  calendar: '/calendar',
} as const;

export const calendarRoutes = {
  calendar: (): string => '/calendar',
} as const;
