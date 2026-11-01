import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Canonical call routes for every variant (omni-plan §5.3.4): `/call/[id]`, `/call/[id]/edit`, `/call/new`.
 * Ids are checked with `isSafeRouteId` so a value from a push payload can never build a path outside the call tree.
 */
export const CALL_ROUTE_PATTERNS = {
  detail: '/call/[id]',
  edit: '/call/[id]/edit',
  new: '/call/new',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe call route id');
  return encodeURIComponent(id);
};

export const callRoutes = {
  callDetail: (id: string): string => `/call/${encodeId(id)}`,
  callEdit: (id: string): string => `/call/${encodeId(id)}/edit`,
  callNew: (): string => '/call/new',
  /** The new-call form in correction mode for a rejected queued call (plan §8.5). */
  callCorrect: (localId: string): string => `/call/new?correct=${encodeId(localId)}`,
} as const;

export const { callDetail, callEdit, callNew, callCorrect } = callRoutes;
