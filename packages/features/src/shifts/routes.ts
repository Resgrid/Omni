import { routePathWithId, routePathWithQuery } from '@resgrid/core/navigation/route-paths';

import type { ShiftView } from './lib/shift-loaders';

/**
 * Shift routes (Responder). Ids pass `isSafeRouteId` before they build a path (push payloads carry them); a refused id
 * builds none (null, reported).
 */
export const SHIFT_ROUTE_PATTERNS = {
  list: '/shifts',
  day: '/shifts/day/[id]',
  trade: '/shifts/trade/[id]',
} as const;

export const shiftRoutes = {
  /** `today` is the list without `?view=`. */
  list: (view?: ShiftView): string | null => routePathWithQuery('shifts.list', '/shifts', { view: view === 'today' ? undefined : view }),
  /** Static shift (workshift) days load from their own endpoint, so the link says which kind it is. */
  day: (shiftDayId: string, options: { workshift?: boolean } = {}): string | null => routePathWithId('shifts.day', shiftDayId, (id) => `/shifts/day/${id}${options.workshift ? '?workshift=1' : ''}`),
  trade: (tradeId: string): string | null => routePathWithId('shifts.trade', tradeId, (id) => `/shifts/trade/${id}`),
} as const;
