import type { GetNearestUnitsResult, GetSetUnitStateResult, NewCallFormResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for dispatch (Dispatch). The contract test checks every entry against Swagger. */
export const dispatchEndpoints = defineEndpoints('dispatch', {
  getNearestUnits: { method: 'GET', path: '/Dispatch/GetNearestUnits', query: ['latitude', 'longitude', 'useRoadEta'] },
  getNewCallData: { method: 'GET', path: '/Dispatch/GetNewCallData' },
  getSetUnitStatusData: { method: 'GET', path: '/Dispatch/GetSetUnitStatusData', query: ['unitId'] },
});

const E = dispatchEndpoints;

/** Nearest available unit board for an incident location. Lists every unit (a team, an apparatus or an individual set up as a unit) and every responder in the caller's dispatch scope, ranked available-first then by ETA, with status, live position, crew shift coverage and role mix. Nothing is dispatched. `GET /Dispatch/GetNearestUnits` — legacy: D. */
export const getNearestUnits = (ctx: ApiContext, params: { latitude?: number | string; longitude?: number | string; useRoadEta?: boolean } = {}, options?: RequestOptions): Promise<GetNearestUnitsResult> =>
  request<GetNearestUnitsResult>(ctx, E.getNearestUnits, { params }, options);

/** Gets all the information required to populate the New Call form. `GET /Dispatch/GetNewCallData` — legacy: DIRU. */
export const getNewCallData = (ctx: ApiContext, options?: RequestOptions): Promise<NewCallFormResult> => request<NewCallFormResult>(ctx, E.getNewCallData, {}, options);

/** `GET /Dispatch/GetSetUnitStatusData` — legacy: BDIU. */
export const getSetUnitStatusData = (ctx: ApiContext, params: { unitId: string }, options?: RequestOptions): Promise<GetSetUnitStateResult> =>
  request<GetSetUnitStateResult>(ctx, E.getSetUnitStatusData, { params }, options);
