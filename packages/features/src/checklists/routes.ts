import { routePathWithQuery } from '@resgrid/core/navigation/route-paths';

/**
 * Checklists route (Responder and Unit). One screen: due checks, on-demand forms, history and the run sheet over it;
 * `?occurrenceId=` opens a scheduled check directly (calendar entries, reminders). Ids pass `isSafeRouteId`; a refused
 * one builds no path (null, reported).
 */
export const CHECKLISTS_ROUTE_PATTERNS = {
  list: '/checklists',
} as const;

export const checklistsRoutes = {
  checklistsList: (occurrenceId?: string): string | null => routePathWithQuery('checklists.list', '/checklists', { occurrenceId }),
} as const;

export const { checklistsList } = checklistsRoutes;
