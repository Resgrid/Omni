import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Checklists route (Responder and Unit). One screen: due checks, on-demand forms, history and the run sheet over it;
 * `?occurrenceId=` opens a scheduled check directly (calendar entries, reminders). Ids pass `isSafeRouteId`.
 */
export const CHECKLISTS_ROUTE_PATTERNS = {
  list: '/checklists',
} as const;

export const checklistsRoutes = {
  checklistsList: (occurrenceId?: string): string => {
    if (occurrenceId === undefined) return '/checklists';
    if (!isSafeRouteId(occurrenceId)) throw new Error('Unsafe checklist route id');
    return `/checklists?occurrenceId=${encodeURIComponent(occurrenceId)}`;
  },
} as const;

export const { checklistsList } = checklistsRoutes;
