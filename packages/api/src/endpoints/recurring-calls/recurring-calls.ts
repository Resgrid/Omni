import type {
  DeleteRecurringCallInput,
  PauseRecurringCallInput,
  RecurringCallActionResult,
  RecurringCallAlertInput,
  RecurringCallAlertsResult,
  RecurringCallIdInput,
  RecurringCallInput,
  RecurringCallOccurrenceInput,
  RecurringCallOccurrenceResult,
  RecurringCallOptionsResult,
  RecurringCallResult,
  RecurringCallsResult,
  SaveRecurringCallResult,
  ScheduledCallsCalendarResult,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/**
 * Core v4 endpoints for recurring calls (RecurringCalls, Core M0319/M0320): schedules, the scheduled calls calendar, the
 * occurrence actions and the dispatcher alerts. None is cached: a dispatcher acts on what is current. The contract test
 * checks every entry against Swagger.
 */
export const recurringCallsEndpoints = defineEndpoints('recurring-calls', {
  acknowledgeRecurringCallAlert: { method: 'POST', path: '/RecurringCalls/AcknowledgeRecurringCallAlert', body: 'json' },
  createOccurrenceCall: { method: 'POST', path: '/RecurringCalls/CreateOccurrenceCall', body: 'json' },
  deleteRecurringCall: { method: 'POST', path: '/RecurringCalls/DeleteRecurringCall', body: 'json' },
  dismissRecurringCallAlert: { method: 'POST', path: '/RecurringCalls/DismissRecurringCallAlert', body: 'json' },
  dispatchOccurrenceNow: { method: 'POST', path: '/RecurringCalls/DispatchOccurrenceNow', body: 'json' },
  getRecurringCall: { method: 'GET', path: '/RecurringCalls/GetRecurringCall', query: ['recurringCallId'] },
  getRecurringCallAlerts: { method: 'GET', path: '/RecurringCalls/GetRecurringCallAlerts', query: ['includeClosedHours'] },
  getRecurringCallOptions: { method: 'GET', path: '/RecurringCalls/GetRecurringCallOptions' },
  getRecurringCalls: { method: 'GET', path: '/RecurringCalls/GetRecurringCalls' },
  getScheduledCallsCalendar: { method: 'GET', path: '/RecurringCalls/GetScheduledCallsCalendar', query: ['start', 'end'] },
  pauseRecurringCall: { method: 'POST', path: '/RecurringCalls/PauseRecurringCall', body: 'json' },
  restoreOccurrence: { method: 'POST', path: '/RecurringCalls/RestoreOccurrence', body: 'json' },
  resumeRecurringCall: { method: 'POST', path: '/RecurringCalls/ResumeRecurringCall', body: 'json' },
  saveRecurringCall: { method: 'POST', path: '/RecurringCalls/SaveRecurringCall', body: 'json' },
  skipOccurrence: { method: 'POST', path: '/RecurringCalls/SkipOccurrence', body: 'json' },
});

const E = recurringCallsEndpoints;

/** The scheduled calls calendar window: two ISO-8601 instants, at most 100 days apart (Core answers 400 otherwise). */
export interface ScheduledCallsCalendarQuery {
  start: string;
  end: string;
}

/** The department's schedules (paused ones included) with each one's next dispatch and open alert count. `GET /RecurringCalls/GetRecurringCalls`. */
export const getRecurringCalls = (ctx: ApiContext, options?: RequestOptions): Promise<RecurringCallsResult> => request<RecurringCallsResult>(ctx, E.getRecurringCalls, {}, options);

/** One schedule, its next dispatches and the calls it created that have not gone out; HTTP 404 when it does not exist. `GET /RecurringCalls/GetRecurringCall`. */
export const getRecurringCall = (ctx: ApiContext, params: { recurringCallId: number }, options?: RequestOptions): Promise<RecurringCallResult> =>
  request<RecurringCallResult>(ctx, E.getRecurringCall, { params }, options);

/** Permissions, run cards, the department's time zone, the lead time and alert choices and the limits a form needs. `GET /RecurringCalls/GetRecurringCallOptions`. */
export const getRecurringCallOptions = (ctx: ApiContext, options?: RequestOptions): Promise<RecurringCallOptionsResult> => request<RecurringCallOptionsResult>(ctx, E.getRecurringCallOptions, {}, options);

/** Creates (`RecurringCallId` 0) or updates a schedule; HTTP 400 with `Errors` when it cannot be saved. `POST /RecurringCalls/SaveRecurringCall`. */
export const saveRecurringCall = (ctx: ApiContext, body: RecurringCallInput, options?: RequestOptions): Promise<SaveRecurringCallResult> => request<SaveRecurringCallResult>(ctx, E.saveRecurringCall, { body }, options);

/** Pauses a schedule with an optional reason and a date it resumes by itself. `POST /RecurringCalls/PauseRecurringCall`. */
export const pauseRecurringCall = (ctx: ApiContext, body: PauseRecurringCallInput, options?: RequestOptions): Promise<RecurringCallActionResult> =>
  request<RecurringCallActionResult>(ctx, E.pauseRecurringCall, { body }, options);

/** `POST /RecurringCalls/ResumeRecurringCall`. */
export const resumeRecurringCall = (ctx: ApiContext, body: RecurringCallIdInput, options?: RequestOptions): Promise<RecurringCallActionResult> =>
  request<RecurringCallActionResult>(ctx, E.resumeRecurringCall, { body }, options);

/** Deletes a schedule and, by default, the calls it created that have not gone out. `POST /RecurringCalls/DeleteRecurringCall`. */
export const deleteRecurringCall = (ctx: ApiContext, body: DeleteRecurringCallInput, options?: RequestOptions): Promise<RecurringCallActionResult> =>
  request<RecurringCallActionResult>(ctx, E.deleteRecurringCall, { body }, options);

/** Scheduled calls, the calls schedules created and their occurrences between two instants. `GET /RecurringCalls/GetScheduledCallsCalendar`. */
export const getScheduledCallsCalendar = (ctx: ApiContext, params: ScheduledCallsCalendarQuery, options?: RequestOptions): Promise<ScheduledCallsCalendarResult> =>
  request<ScheduledCallsCalendarResult>(ctx, E.getScheduledCallsCalendar, { params }, options);

/** Skips an occurrence that has no call yet. `POST /RecurringCalls/SkipOccurrence`. */
export const skipOccurrence = (ctx: ApiContext, body: RecurringCallOccurrenceInput, options?: RequestOptions): Promise<RecurringCallOccurrenceResult> =>
  request<RecurringCallOccurrenceResult>(ctx, E.skipOccurrence, { body }, options);

/** `POST /RecurringCalls/RestoreOccurrence`. */
export const restoreOccurrence = (ctx: ApiContext, body: RecurringCallOccurrenceInput, options?: RequestOptions): Promise<RecurringCallOccurrenceResult> =>
  request<RecurringCallOccurrenceResult>(ctx, E.restoreOccurrence, { body }, options);

/** Creates an occurrence's call without sending it: a scheduled call when still to come, a pending call when already due. `POST /RecurringCalls/CreateOccurrenceCall`. */
export const createOccurrenceCall = (ctx: ApiContext, body: RecurringCallOccurrenceInput, options?: RequestOptions): Promise<RecurringCallOccurrenceResult> =>
  request<RecurringCallOccurrenceResult>(ctx, E.createOccurrenceCall, { body }, options);

/** Sends an occurrence now (creating its call if needed): outcome Dispatched, or Held when nobody could be sent. `POST /RecurringCalls/DispatchOccurrenceNow`. */
export const dispatchOccurrenceNow = (ctx: ApiContext, body: RecurringCallOccurrenceInput, options?: RequestOptions): Promise<RecurringCallOccurrenceResult> =>
  request<RecurringCallOccurrenceResult>(ctx, E.dispatchOccurrenceNow, { body }, options);

/** Every open alert the viewer can see, plus with `includeClosedHours` those raised in that many past hours (at most 720). `GET /RecurringCalls/GetRecurringCallAlerts`. */
export const getRecurringCallAlerts = (ctx: ApiContext, params: { includeClosedHours?: number } = {}, options?: RequestOptions): Promise<RecurringCallAlertsResult> =>
  request<RecurringCallAlertsResult>(ctx, E.getRecurringCallAlerts, { params }, options);

/** `POST /RecurringCalls/AcknowledgeRecurringCallAlert`. */
export const acknowledgeRecurringCallAlert = (ctx: ApiContext, body: RecurringCallAlertInput, options?: RequestOptions): Promise<RecurringCallActionResult> =>
  request<RecurringCallActionResult>(ctx, E.acknowledgeRecurringCallAlert, { body }, options);

/** Closes an alert with an optional note. `POST /RecurringCalls/DismissRecurringCallAlert`. */
export const dismissRecurringCallAlert = (ctx: ApiContext, body: RecurringCallAlertInput, options?: RequestOptions): Promise<RecurringCallActionResult> =>
  request<RecurringCallActionResult>(ctx, E.dismissRecurringCallAlert, { body }, options);
