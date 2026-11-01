import type { GroupsResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints } from '../../core';

/** Core v4 endpoints for groups (Groups). The contract test checks every entry against Swagger. */
export const groupsEndpoints = defineEndpoints('groups', {
  getAllGroups: { method: 'GET', path: '/Groups/GetAllGroups', cacheTtlMs: 15 * 60 * 1000 },
});

const E = groupsEndpoints;

/** Gets all deparment groups for a department. `GET /Groups/GetAllGroups` (cached) — legacy: BDIRU. */
export const getAllGroups = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GroupsResult> => cachedRequest<GroupsResult>(ctx, E.getAllGroups, {}, options);
