import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Route plan previews (`capabilities.routes.preview`, Core M0322): any app that picks or runs routes opens a plan here. Plan
 * ids pass `isSafeRouteId`; a refused id builds no path (null, reported), so the link is hidden.
 */
export const ROUTE_PLANS_ROUTE_PATTERNS = {
  preview: '/route-plans/[id]',
} as const;

export const routePlansRoutes = {
  preview: (planId: string | null | undefined): string | null => routePathWithId('route_plans.preview', planId, (id) => `/route-plans/${id}`),
} as const;
