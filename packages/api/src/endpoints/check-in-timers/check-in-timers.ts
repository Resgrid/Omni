import type { CallPersonnelCheckInStatusResult, CheckInRecordResult, CheckInTimerStatusResult, PerformCheckInInput, PerformCheckInResult, ResolvedCheckInTimerResult, ToggleCallTimersResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for check-in-timers (CheckInTimers). The contract test checks every entry against Swagger. */
export const checkInTimersEndpoints = defineEndpoints('check-in-timers', {
  getCallPersonnelCheckInStatuses: { method: 'GET', path: '/CheckInTimers/GetCallPersonnelCheckInStatuses', query: ['callId'] },
  getCheckInHistory: { method: 'GET', path: '/CheckInTimers/GetCheckInHistory', query: ['callId'] },
  getTimersForCall: { method: 'GET', path: '/CheckInTimers/GetTimersForCall', query: ['callId'] },
  getTimerStatuses: { method: 'GET', path: '/CheckInTimers/GetTimerStatuses', query: ['callId'] },
  performCheckIn: { method: 'POST', path: '/CheckInTimers/PerformCheckIn', body: 'json' },
  toggleCallTimers: { method: 'PUT', path: '/CheckInTimers/ToggleCallTimers', query: ['callId', 'enabled'] },
});

const E = checkInTimersEndpoints;

/** For a call that has a personnel check-in timer active, returns the current check-in status (last check-in, time remaining, colour status) for every person dispatched on the call. `GET /CheckInTimers/GetCallPersonnelCheckInStatuses` — legacy: DI. */
export const getCallPersonnelCheckInStatuses = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<CallPersonnelCheckInStatusResult> =>
  request<CallPersonnelCheckInStatusResult>(ctx, E.getCallPersonnelCheckInStatuses, { params }, options);

/** Gets all check-in records for a call. `GET /CheckInTimers/GetCheckInHistory` — legacy: DIRU. */
export const getCheckInHistory = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<CheckInRecordResult> =>
  request<CheckInRecordResult>(ctx, E.getCheckInHistory, { params }, options);

/** Gets the resolved timers for a specific call. `GET /CheckInTimers/GetTimersForCall` — legacy: DIRU. */
export const getTimersForCall = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<ResolvedCheckInTimerResult> =>
  request<ResolvedCheckInTimerResult>(ctx, E.getTimersForCall, { params }, options);

/** Gets real-time timer statuses with color coding for a call. `GET /CheckInTimers/GetTimerStatuses` — legacy: DIRU. */
export const getTimerStatuses = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<CheckInTimerStatusResult> =>
  request<CheckInTimerStatusResult>(ctx, E.getTimerStatuses, { params }, options);

/** Records a check-in for a call with optional geolocation. `POST /CheckInTimers/PerformCheckIn` — legacy: DIRU. */
export const performCheckIn = (ctx: ApiContext, body: PerformCheckInInput, options?: RequestOptions): Promise<PerformCheckInResult> => request<PerformCheckInResult>(ctx, E.performCheckIn, { body }, options);

/** Enables or disables check-in timers on a call. `PUT /CheckInTimers/ToggleCallTimers` — legacy: DIRU. */
export const toggleCallTimers = (ctx: ApiContext, params: { callId: number | string; enabled?: boolean }, options?: RequestOptions): Promise<ToggleCallTimersResult> =>
  request<ToggleCallTimersResult>(ctx, E.toggleCallTimers, { params }, options);
