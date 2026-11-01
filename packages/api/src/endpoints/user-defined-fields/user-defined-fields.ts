import type { SaveUdfFieldValuesInput, UdfFieldValuesResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for user-defined-fields (UserDefinedFields). The contract test checks every entry against Swagger. */
export const userDefinedFieldsEndpoints = defineEndpoints('user-defined-fields', {
  getUdfValues: { method: 'GET', path: '/UserDefinedFields/Values/{entityType}/{entityId}' },
  saveUdfValues: { method: 'POST', path: '/UserDefinedFields/Values', body: 'json' },
});

const E = userDefinedFieldsEndpoints;

/** Gets all UDF field values for a specific entity, restricted to fields visible to the caller. `GET /UserDefinedFields/Values/{entityType}/{entityId}` — legacy: D. */
export const getUdfValues = (ctx: ApiContext, params: { entityType: number | string; entityId: string }, options?: RequestOptions): Promise<UdfFieldValuesResult> =>
  request<UdfFieldValuesResult>(ctx, E.getUdfValues, { params }, options);

/** Saves UDF field values for a specific entity (validates server-side). Only values for fields visible to the caller are accepted. `POST /UserDefinedFields/Values` — legacy: D. */
export const saveUdfValues = (ctx: ApiContext, body: SaveUdfFieldValuesInput, options?: RequestOptions): Promise<UdfFieldValuesResult> => request<UdfFieldValuesResult>(ctx, E.saveUdfValues, { body }, options);
