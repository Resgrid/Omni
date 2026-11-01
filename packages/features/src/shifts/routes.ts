import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

import type { ShiftView } from './lib/shift-loaders';

/** Shift routes (Responder). Ids pass `isSafeRouteId` before they build a path (push payloads carry them). */
export const SHIFT_ROUTE_PATTERNS = {
  list: '/shifts',
  day: '/shifts/day/[id]',
  trade: '/shifts/trade/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe shift route id');
  return encodeURIComponent(id);
};

export const shiftRoutes = {
  list: (view?: ShiftView): string => (view && view !== 'today' ? `/shifts?view=${view}` : '/shifts'),
  /** Static shift (workshift) days load from their own endpoint, so the link says which kind it is. */
  day: (shiftDayId: string, options: { workshift?: boolean } = {}): string => `/shifts/day/${encodeId(shiftDayId)}${options.workshift ? '?workshift=1' : ''}`,
  trade: (tradeId: string): string => `/shifts/trade/${encodeId(tradeId)}`,
} as const;
