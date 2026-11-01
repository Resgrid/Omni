import type { GetConfigResult, GetSystemConfigResult, GetTerminologyResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for config (Config). The contract test checks every entry against Swagger. */
export const configEndpoints = defineEndpoints('config', {
  getConfig: { method: 'GET', path: '/Config/GetConfig', query: ['key'], cacheTtlMs: 15 * 60 * 1000 },
  getDepartmentConfig: { method: 'GET', path: '/Config/GetDepartmentConfig', query: ['key'] },
  getSystemConfig: { method: 'GET', path: '/Config/GetSystemConfig', anonymous: true, cacheTtlMs: 15 * 60 * 1000 },
  getTerminology: { method: 'GET', path: '/Config/GetTerminology' },
});

const E = configEndpoints;

/** Gets the config values for a key. `GET /Config/GetConfig` (cached) — legacy: DIRU. */
export const getConfig = (ctx: ApiContext, params: { key?: string } = {}, options?: CachedRequestOptions): Promise<GetConfigResult> => cachedRequest<GetConfigResult>(ctx, E.getConfig, { params }, options);

/** `GET /Config/GetDepartmentConfig` — legacy: B. */
export const getDepartmentConfig = (ctx: ApiContext, params: { key?: string } = {}, options?: RequestOptions): Promise<GetConfigResult> => request<GetConfigResult>(ctx, E.getDepartmentConfig, { params }, options);

/** Gets the system config. `GET /Config/GetSystemConfig` (cached) — legacy: BIRU. */
export const getSystemConfig = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GetSystemConfigResult> => cachedRequest<GetSystemConfigResult>(ctx, E.getSystemConfig, {}, options);

/** Gets the department's own names for modules and built-in record types (Department -> Terminology). Every term is listed; Name is null for a term the department has not renamed. Labels only: keys, routes and API values never change. `GET /Config/GetTerminology` — legacy: DIRU. */
export const getTerminology = (ctx: ApiContext, options?: RequestOptions): Promise<GetTerminologyResult> => request<GetTerminologyResult>(ctx, E.getTerminology, {}, options);
