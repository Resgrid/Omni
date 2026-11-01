import type { DepartmentRightsResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for security (Security). The contract test checks every entry against Swagger. */
export const securityEndpoints = defineEndpoints('security', {
  getCurrentUsersRights: { method: 'GET', path: '/Security/GetCurrentUsersRights' },
});

const E = securityEndpoints;

/** Gets the current users department rights. `GET /Security/GetCurrentUsersRights` — legacy: BDIRU. */
export const getCurrentUsersRights = (ctx: ApiContext, options?: RequestOptions): Promise<DepartmentRightsResult> => request<DepartmentRightsResult>(ctx, E.getCurrentUsersRights, {}, options);
