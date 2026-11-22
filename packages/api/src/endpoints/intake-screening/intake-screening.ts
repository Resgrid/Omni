import type { DismissIntakeCallInput, DismissIntakeCallResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for intake spam handling (IntakeScreening, M0326). The contract test checks every entry against Swagger. */
export const intakeScreeningEndpoints = defineEndpoints('intake-screening', {
  dismissIntakeCallAsSpam: { method: 'POST', path: '/IntakeScreening/DismissAsSpam', body: 'json' },
});

const E = intakeScreeningEndpoints;

/**
 * Cancels a pending intake call as spam and (with `BlockSender`) blocks its sender from the department's intake channels; nobody is
 * notified and nothing is texted back. Needs the right to close the call. `POST /IntakeScreening/DismissAsSpam` — new in Omni.
 */
export const dismissIntakeCallAsSpam = (ctx: ApiContext, body: DismissIntakeCallInput, options?: RequestOptions): Promise<DismissIntakeCallResult> =>
  request<DismissIntakeCallResult>(ctx, E.dismissIntakeCallAsSpam, { body }, options);
