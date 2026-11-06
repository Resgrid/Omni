import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Canonical call routes for every variant (omni-plan §5.3.4): `/call/[id]`, `/call/[id]/edit`, `/call/new`.
 * Ids are checked with `isSafeRouteId` so a value from a push payload can never build a path outside the call tree; a
 * refused id builds no path (null, reported), so callers navigate with `pushRoutePath`.
 */
export const CALL_ROUTE_PATTERNS = {
  detail: '/call/[id]',
  edit: '/call/[id]/edit',
  new: '/call/new',
} as const;

export const callRoutes = {
  callDetail: (id: string): string | null => routePathWithId('calls.detail', id, (callId) => `/call/${callId}`),
  callEdit: (id: string): string | null => routePathWithId('calls.edit', id, (callId) => `/call/${callId}/edit`),
  callNew: (): string => '/call/new',
  /** The new-call form in correction mode for a rejected queued call (plan §8.5). */
  callCorrect: (localId: string): string | null => routePathWithId('calls.correct', localId, (id) => `/call/new?correct=${id}`),
} as const;

export const { callDetail, callEdit, callNew, callCorrect } = callRoutes;

/**
 * Where a call saved as Pending waits (the call-queues module's screen, only in variants with `calls.queues`): the new
 * call form shows it after "Save as pending", as Dispatch does.
 */
export const PENDING_CALLS_ROUTE = '/pending-calls';
