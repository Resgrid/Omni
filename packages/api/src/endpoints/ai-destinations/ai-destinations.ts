import type { AiDestinationAdviceResult, ApplyAiDestinationAdviceInput, DismissAiDestinationAdviceInput, RequestAiDestinationAdviceInput } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for Enhanced AI destination advice (AiDestinations, M0323). The contract test checks every entry against Swagger. */
export const aiDestinationsEndpoints = defineEndpoints('ai-destinations', {
  getAiDestinationAdvice: { method: 'GET', path: '/AiDestinations/GetAdvice', query: ['callId'] },
  requestAiDestinationAdvice: { method: 'POST', path: '/AiDestinations/RequestAdvice', body: 'json' },
  applyAiDestinationAdvice: { method: 'POST', path: '/AiDestinations/ApplyAdvice', body: 'json' },
  dismissAiDestinationAdvice: { method: 'POST', path: '/AiDestinations/DismissAdvice', body: 'json' },
});

const E = aiDestinationsEndpoints;

/** Core bounds "Ask Enhanced AI" to about 20 seconds; the request waits a little longer than that before giving up. */
export const REQUEST_AI_DESTINATION_ADVICE_TIMEOUT_MS = 35_000;

/**
 * The call's open destination advice, whether the department may use advice, and whether the caller may act on it (never
 * cached: it changes with every review). `GET /AiDestinations/GetAdvice` — new in Omni (call intake plan §7).
 */
export const getAiDestinationAdvice = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<AiDestinationAdviceResult> =>
  request<AiDestinationAdviceResult>(ctx, E.getAiDestinationAdvice, { params }, options);

/** "Ask Enhanced AI": advises on the call's destination now. `POST /AiDestinations/RequestAdvice` — new in Omni. */
export const requestAiDestinationAdvice = (ctx: ApiContext, body: RequestAiDestinationAdviceInput, options?: RequestOptions): Promise<AiDestinationAdviceResult> =>
  request<AiDestinationAdviceResult>(ctx, E.requestAiDestinationAdvice, { body }, { timeoutMs: REQUEST_AI_DESTINATION_ADVICE_TIMEOUT_MS, ...options });

/** Sets the call's destination to the advice's recommended POI (a free destination is cleared). `POST /AiDestinations/ApplyAdvice` — new in Omni. */
export const applyAiDestinationAdvice = (ctx: ApiContext, body: ApplyAiDestinationAdviceInput, options?: RequestOptions): Promise<AiDestinationAdviceResult> =>
  request<AiDestinationAdviceResult>(ctx, E.applyAiDestinationAdvice, { body }, options);

/** Dismisses the advice, with an optional reason (at most 200 characters). `POST /AiDestinations/DismissAdvice` — new in Omni. */
export const dismissAiDestinationAdvice = (ctx: ApiContext, body: DismissAiDestinationAdviceInput, options?: RequestOptions): Promise<AiDestinationAdviceResult> =>
  request<AiDestinationAdviceResult>(ctx, E.dismissAiDestinationAdvice, { body }, options);
