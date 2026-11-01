import type { FormResult, FormsResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for forms (Forms). The contract test checks every entry against Swagger. */
export const formsEndpoints = defineEndpoints('forms', {
  getAllForms: { method: 'GET', path: '/Forms/GetAllForms', cacheTtlMs: 60 * 60 * 1000 },
  getFormById: { method: 'GET', path: '/Forms/GetFormById', query: ['formId'] },
  getNewCallForm: { method: 'GET', path: '/Forms/GetNewCallForm', cacheTtlMs: 60 * 60 * 1000 },
});

const E = formsEndpoints;

/** Gets all active (non-deleted) forms for the department. Used by mobile apps to retrieve available forms for calls and other entities. `GET /Forms/GetAllForms` (cached) — legacy: D. */
export const getAllForms = (ctx: ApiContext, options?: CachedRequestOptions): Promise<FormsResult> => cachedRequest<FormsResult>(ctx, E.getAllForms, {}, options);

/** Gets a specific form by its identifier. `GET /Forms/GetFormById` — legacy: D. */
export const getFormById = (ctx: ApiContext, params: { formId: string }, options?: RequestOptions): Promise<FormResult> => request<FormResult>(ctx, E.getFormById, { params }, options);

/** Gets the Department Form that can be used for the new call process (i.e. call intake/triage form). `GET /Forms/GetNewCallForm` (cached) — legacy: D. */
export const getNewCallForm = (ctx: ApiContext, options?: CachedRequestOptions): Promise<FormResult> => cachedRequest<FormResult>(ctx, E.getNewCallForm, {}, options);
