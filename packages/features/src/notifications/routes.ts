/** The notifications inbox route (Novu inbox). The push modal has no route: it is mounted once in the shell. */
export const NOTIFICATIONS_ROUTE_PATTERNS = {
  inbox: '/notifications',
} as const;

export const notificationsRoutes = {
  inbox: (): string => '/notifications',
} as const;
