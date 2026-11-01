import type { RecordPushResponseInput, RecordPushResponseResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for communication-tests (CommunicationTests). The contract test checks every entry against Swagger. */
export const communicationTestsEndpoints = defineEndpoints('communication-tests', {
  recordPushResponse: { method: 'POST', path: '/CommunicationTests/RecordPushResponse', body: 'json' },
});

const E = communicationTestsEndpoints;

/** Records a push notification response for a communication test. `POST /CommunicationTests/RecordPushResponse` — legacy: R. */
export const recordPushResponse = (ctx: ApiContext, body: RecordPushResponseInput, options?: RequestOptions): Promise<RecordPushResponseResult> =>
  request<RecordPushResponseResult>(ctx, E.recordPushResponse, { body }, options);
