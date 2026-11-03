import type { SaveUdfFieldValuesInput, UdfDefinitionResult, UdfFieldValuesResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for user-defined-fields (UserDefinedFields). The contract test checks every entry against Swagger. */
export const userDefinedFieldsEndpoints = defineEndpoints('user-defined-fields', {
  getUdfDefinition: { method: 'GET', path: '/UserDefinedFields/{entityType}' },
  getUdfValues: { method: 'GET', path: '/UserDefinedFields/Values/{entityType}/{entityId}' },
  saveUdfValues: { method: 'POST', path: '/UserDefinedFields/Values', body: 'json' },
});

const E = userDefinedFieldsEndpoints;

/** The department's active custom-field definition for an entity type (Call 0, Personnel 1, Unit 2, Contact 3). `GET /UserDefinedFields/{entityType}` — legacy: D. */
export const getUdfDefinition = (ctx: ApiContext, params: { entityType: number | string }, options?: RequestOptions): Promise<UdfDefinitionResult> =>
  request<UdfDefinitionResult>(ctx, E.getUdfDefinition, { params }, options);

/** Gets all UDF field values for a specific entity, restricted to fields visible to the caller. `GET /UserDefinedFields/Values/{entityType}/{entityId}` — legacy: D. */
export const getUdfValues = (ctx: ApiContext, params: { entityType: number | string; entityId: string }, options?: RequestOptions): Promise<UdfFieldValuesResult> =>
  request<UdfFieldValuesResult>(ctx, E.getUdfValues, { params }, options);

/** Saves UDF field values for a specific entity (validates server-side). Only values for fields visible to the caller are accepted. `POST /UserDefinedFields/Values` — legacy: D. */
export const saveUdfValues = (ctx: ApiContext, body: SaveUdfFieldValuesInput, options?: RequestOptions): Promise<UdfFieldValuesResult> => request<UdfFieldValuesResult>(ctx, E.saveUdfValues, { body }, options);
