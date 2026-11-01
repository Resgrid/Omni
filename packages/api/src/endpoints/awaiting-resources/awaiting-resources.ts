import type { AwaitingResourcesActionResult, AwaitingResourcesResult, CallOutstandingRequirementsResult, DismissOutstandingRequirementInput, DispatchToAwaitingCallInput, ResponseCodesResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for awaiting-resources (AwaitingResources). The contract test checks every entry against Swagger. */
export const awaitingResourcesEndpoints = defineEndpoints('awaiting-resources', {
  dismissRequirement: { method: 'POST', path: '/AwaitingResources/DismissRequirement', body: 'json' },
  dispatchUnitToAwaitingCall: { method: 'POST', path: '/AwaitingResources/DispatchUnit', body: 'json' },
  getAwaitingCalls: { method: 'GET', path: '/AwaitingResources/GetAwaitingCalls' },
  getAwaitingResourceResponseCodes: { method: 'GET', path: '/AwaitingResources/GetResponseCodes' },
  getCallRequirements: { method: 'GET', path: '/AwaitingResources/GetCallRequirements', query: ['callId'] },
});

const E = awaitingResourcesEndpoints;

/** Dismisses an open requirement the call no longer needs; the same authority as editing the call. `POST /AwaitingResources/DismissRequirement` — legacy: D. */
export const dismissRequirement = (ctx: ApiContext, body: DismissOutstandingRequirementInput, options?: RequestOptions): Promise<AwaitingResourcesActionResult> =>
  request<AwaitingResourcesActionResult>(ctx, E.dismissRequirement, { body }, options);

/** Adds a unit to a call awaiting resources in one step (additive; only that unit is notified), which resolves the requirement it matches. `POST /AwaitingResources/DispatchUnit` — legacy: D. */
export const dispatchUnitToAwaitingCall = (ctx: ApiContext, body: DispatchToAwaitingCallInput, options?: RequestOptions): Promise<AwaitingResourcesActionResult> =>
  request<AwaitingResourcesActionResult>(ctx, E.dispatchUnitToAwaitingCall, { body }, options);

/** Every active call of the department still awaiting a required resource, highest priority then oldest first, with the units now available that match each requirement (nearest first when it can be measured). Under group-scoped dispatch, only the calls the user dispatches (the same calls as the active call list). `GET /AwaitingResources/GetAwaitingCalls` — legacy: D. */
export const getAwaitingCalls = (ctx: ApiContext, options?: RequestOptions): Promise<AwaitingResourcesResult> => request<AwaitingResourcesResult>(ctx, E.getAwaitingCalls, {}, options);

/** The department's response code catalog, for the per-unit code choice on a run card proposal. Empty when the department uses no codes (the feature is then invisible). `GET /AwaitingResources/GetResponseCodes` — legacy: D. */
export const getAwaitingResourceResponseCodes = (ctx: ApiContext, options?: RequestOptions): Promise<ResponseCodesResult> => request<ResponseCodesResult>(ctx, E.getAwaitingResourceResponseCodes, {}, options);

/** The call's open outstanding requirements, reconciled with its dispatches first. `GET /AwaitingResources/GetCallRequirements` — legacy: D. */
export const getCallRequirements = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<CallOutstandingRequirementsResult> =>
  request<CallOutstandingRequirementsResult>(ctx, E.getCallRequirements, { params }, options);
