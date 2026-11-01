import type { RunCardRecommendationResult, RunCardsResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for run-cards (RunCards). The contract test checks every entry against Swagger. */
export const runCardsEndpoints = defineEndpoints('run-cards', {
  getAllRunCards: { method: 'GET', path: '/RunCards/GetAllRunCards' },
  getCallRecommendation: { method: 'GET', path: '/RunCards/GetCallRecommendation', query: ['callId', 'alarmLevel', 'reevaluate'] },
  getDispatchRecommendation: { method: 'GET', path: '/RunCards/GetRecommendation', query: ['priority', 'type', 'latitude', 'longitude', 'alarmLevel'] },
});

const E = runCardsEndpoints;

/** All run cards for the department (fully hydrated). `GET /RunCards/GetAllRunCards` — legacy: D. */
export const getAllRunCards = (ctx: ApiContext, options?: RequestOptions): Promise<RunCardsResult> => request<RunCardsResult>(ctx, E.getAllRunCards, {}, options);

/** Recommendation for adding resources to a call already out: the run card for the call's priority, type and location at its current alarm level, with the units and people already on the call counted toward the level's requirements, so only what is still missing is recommended. A higher alarm level previews what Strike Next Alarm would add (that level in full, nothing already on the call). Nothing is dispatched. `GET /RunCards/GetCallRecommendation` — legacy: D. */
export const getCallRecommendation = (ctx: ApiContext, params: { callId: number | string; alarmLevel?: number | string; reevaluate?: boolean }, options?: RequestOptions): Promise<RunCardRecommendationResult> =>
  request<RunCardRecommendationResult>(ctx, E.getCallRecommendation, { params }, options);

/** Recommendation preview: what would the department's run cards dispatch for this priority/type/location right now? Nothing is dispatched. `GET /RunCards/GetRecommendation` — legacy: D. */
export const getDispatchRecommendation = (
  ctx: ApiContext,
  params: { priority?: number | string; type?: string; latitude?: number | string; longitude?: number | string; alarmLevel?: number | string } = {},
  options?: RequestOptions
): Promise<RunCardRecommendationResult> => request<RunCardRecommendationResult>(ctx, E.getDispatchRecommendation, { params }, options);
