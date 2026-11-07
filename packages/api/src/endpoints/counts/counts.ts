import type { BadgeCountsResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for counts (Counts). The contract test checks every entry against Swagger. */
export const countsEndpoints = defineEndpoints('counts', {
  getBadgeCounts: { method: 'GET', path: '/Counts/GetBadgeCounts', query: ['include', 'activeUnitId'] },
});

const E = countsEndpoints;

export interface BadgeCountsQuery {
  /** Keys of the counts to compute (Core `BadgeCountKeys`); a key the server does not know is ignored. */
  include: readonly string[];
  /** Unit app: the active unit, whose chat channels and checklists count too. */
  activeUnitId?: number | string | null;
}

/**
 * Gets the menu and tab badge counts in one request, one entry per asked-for count the caller can see (open calls,
 * unread inbox messages and chat messages, severe weather, expiring certifications, active deployments, due checklists,
 * today's shifts, shift trades…). Only the counts named in `include` are computed. Never cached here: the server keeps
 * the department-wide counts in a short cache it clears on every change. `GET /Counts/GetBadgeCounts` — legacy: none (Omni).
 */
export const getBadgeCounts = (ctx: ApiContext, params: BadgeCountsQuery, options?: RequestOptions): Promise<BadgeCountsResult> =>
  request<BadgeCountsResult>(ctx, E.getBadgeCounts, { params: { include: params.include.join(','), activeUnitId: params.activeUnitId } }, options);
