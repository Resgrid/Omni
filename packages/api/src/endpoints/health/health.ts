import type { HealthResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for health (Health). The contract test checks every entry against Swagger. */
export const healthEndpoints = defineEndpoints('health', {
  getHealth: { method: 'GET', path: '/Health/GetCurrent', anonymous: true },
});

const E = healthEndpoints;

/** Gets the current users department rights. `GET /Health/GetCurrent`. */
export const getHealth = (ctx: ApiContext, options?: RequestOptions): Promise<HealthResult> => request<HealthResult>(ctx, E.getHealth, {}, options);
