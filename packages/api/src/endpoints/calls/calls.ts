import type {
  ActiveCallsResult,
  CallExtraDataResult,
  CallNotesResult,
  CallPrioritiesResult,
  CallQuickTemplatesResult,
  CallResult,
  CallSiteInfoResult,
  CallTypesResult,
  CloseCallInput,
  CloseCallResult,
  DeleteCallResult,
  DispatchCallNowInput,
  DispatchCallNowResult,
  EditCallInput,
  EscalateCallResult,
  LocationHistoryResult,
  NewCallFieldPolicyResult,
  NewCallInput,
  PendingCallsResult,
  SaveCallNoteInput,
  SaveCallNoteResult,
  SaveCallResult,
  ScheduledCallsResult,
  UpdateDispatchTimeInput,
} from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for calls (Calls, CallPriorities, Templates, CallTypes, CallNotes). The contract test checks every entry against Swagger. */
export const callsEndpoints = defineEndpoints('calls', {
  closeCall: { method: 'PUT', path: '/Calls/CloseCall', body: 'json' },
  deleteCall: { method: 'DELETE', path: '/Calls/DeleteCall', query: ['callId'] },
  dispatchCallNow: { method: 'PUT', path: '/Calls/DispatchCallNow', body: 'json' },
  editCall: { method: 'PUT', path: '/Calls/EditCall', body: 'json' },
  escalateCall: { method: 'PUT', path: '/Calls/EscalateCall', query: ['callId'] },
  getActiveCalls: { method: 'GET', path: '/Calls/GetActiveCalls', cacheTtlMs: 30 * 1000 },
  getAllCallPriorities: { method: 'GET', path: '/CallPriorities/GetAllCallPriorites', cacheTtlMs: 6 * 60 * 60 * 1000 },
  getAllCallQuickTemplates: { method: 'GET', path: '/Templates/GetAllCallQuickTemplates', cacheTtlMs: 60 * 60 * 1000 },
  getAllCallTypes: { method: 'GET', path: '/CallTypes/GetAllCallTypes', cacheTtlMs: 6 * 60 * 60 * 1000 },
  getAllPendingScheduledCalls: { method: 'GET', path: '/Calls/GetAllPendingScheduledCalls' },
  getCall: { method: 'GET', path: '/Calls/GetCall', query: ['callId'] },
  getCallExtraData: { method: 'GET', path: '/Calls/GetCallExtraData', query: ['callId'] },
  getCallLocationHistory: { method: 'GET', path: '/Calls/GetCallLocationHistory', query: ['callId'] },
  getCallNotes: { method: 'GET', path: '/CallNotes/GetCallNotes', query: ['callId'] },
  getCallSiteInfo: { method: 'GET', path: '/Calls/GetCallSiteInfo', query: ['callId'] },
  getNewCallFieldPolicy: { method: 'GET', path: '/Calls/GetNewCallFieldPolicy' },
  getPendingCalls: { method: 'GET', path: '/Calls/GetPendingCalls' },
  saveCall: { method: 'POST', path: '/Calls/SaveCall', body: 'json' },
  saveCallNote: { method: 'POST', path: '/CallNotes/SaveCallNote', body: 'json' },
  updateScheduledDispatchTime: { method: 'PUT', path: '/Calls/UpdateScheduledDispatchTime', body: 'json' },
});

const E = callsEndpoints;

/** Closes a Resgrid call. `PUT /Calls/CloseCall` — legacy: BDIRU. */
export const closeCall = (ctx: ApiContext, body: CloseCallInput, options?: RequestOptions): Promise<CloseCallResult> => request<CloseCallResult>(ctx, E.closeCall, { body }, options);

/** Deletes a call. `DELETE /Calls/DeleteCall` — legacy: D. */
export const deleteCall = (ctx: ApiContext, params: { callId: string }, options?: RequestOptions): Promise<DeleteCallResult> => request<DeleteCallResult>(ctx, E.deleteCall, { params }, options);

/** Dispatches a waiting call right now: a pending call, or a scheduled call that has not gone out yet. The call becomes active and everyone on its dispatch list is notified. Pass DispatchList to replace who it goes to. `PUT /Calls/DispatchCallNow` — legacy: D. */
export const dispatchCallNow = (ctx: ApiContext, body: DispatchCallNowInput, options?: RequestOptions): Promise<DispatchCallNowResult> => request<DispatchCallNowResult>(ctx, E.dispatchCallNow, { body }, options);

/** Updates an existing Active Call in the Resgrid system. `PUT /Calls/EditCall` — legacy: BDIRU. */
export const editCall = (ctx: ApiContext, body: EditCallInput, options?: RequestOptions): Promise<SaveCallResult> => request<SaveCallResult>(ctx, E.editCall, { body }, options);

/** "Strike Next Alarm": escalates a call to its next alarm level, additively dispatching the active run card's next-level requirements and notifying only the newly added resources. `PUT /Calls/EscalateCall` — legacy: D. */
export const escalateCall = (ctx: ApiContext, params: { callId: string }, options?: RequestOptions): Promise<EscalateCallResult> => request<EscalateCallResult>(ctx, E.escalateCall, { params }, options);

/** Returns all the active calls for the department. `GET /Calls/GetActiveCalls` (cached) — legacy: BDIRU. */
export const getActiveCalls = (ctx: ApiContext, options?: CachedRequestOptions): Promise<ActiveCallsResult> => cachedRequest<ActiveCallsResult>(ctx, E.getActiveCalls, {}, options);

/** Gets all the call priorities in a department. `GET /CallPriorities/GetAllCallPriorites` (cached) — legacy: BDIRU. */
export const getAllCallPriorities = (ctx: ApiContext, options?: CachedRequestOptions): Promise<CallPrioritiesResult> => cachedRequest<CallPrioritiesResult>(ctx, E.getAllCallPriorities, {}, options);

/** Gets all call quick templates for the department. Call quick templates are used to rapidly dispatch pre-configured calls from mobile apps. `GET /Templates/GetAllCallQuickTemplates` (cached) — legacy: D. */
export const getAllCallQuickTemplates = (ctx: ApiContext, options?: CachedRequestOptions): Promise<CallQuickTemplatesResult> => cachedRequest<CallQuickTemplatesResult>(ctx, E.getAllCallQuickTemplates, {}, options);

/** Gets all the call priorities in a department. `GET /CallTypes/GetAllCallTypes` (cached) — legacy: BDIRU. */
export const getAllCallTypes = (ctx: ApiContext, options?: CachedRequestOptions): Promise<CallTypesResult> => cachedRequest<CallTypesResult>(ctx, E.getAllCallTypes, {}, options);

/** Returns all the non-dispatched (pending) scheduled calls for the department. `GET /Calls/GetAllPendingScheduledCalls` — legacy: BD. */
export const getAllPendingScheduledCalls = (ctx: ApiContext, options?: RequestOptions): Promise<ScheduledCallsResult> => request<ScheduledCallsResult>(ctx, E.getAllPendingScheduledCalls, {}, options);

/** Returns a specific call from the Resgrid System. `GET /Calls/GetCall` — legacy: BDIRU. */
export const getCall = (ctx: ApiContext, params: { callId: string }, options?: RequestOptions): Promise<CallResult> => request<CallResult>(ctx, E.getCall, { params }, options);

/** Gets all the meta-data around a call, dispatched personnel, units, groups and responses. `GET /Calls/GetCallExtraData` — legacy: BDIRU. */
export const getCallExtraData = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<CallExtraDataResult> =>
  request<CallExtraDataResult>(ctx, E.getCallExtraData, { params }, options);

/** Previous calls at this call's location: other calls at the same address however it was typed, nearby calls without a street address, and calls linked to the same contacts, newest first with their notes. Limited to the calls the user may see; address matching is off while the department's Advanced Data Protection is on. `GET /Calls/GetCallLocationHistory` — legacy: DIRU. */
export const getCallLocationHistory = (ctx: ApiContext, params: { callId: string }, options?: RequestOptions): Promise<LocationHistoryResult> =>
  request<LocationHistoryResult>(ctx, E.getCallLocationHistory, { params }, options);

/** Get notes for a call. `GET /CallNotes/GetCallNotes` — legacy: BDIRU. */
export const getCallNotes = (ctx: ApiContext, params: { callId: string }, options?: RequestOptions): Promise<CallNotesResult> => request<CallNotesResult>(ctx, E.getCallNotes, { params }, options);

/** Gets the site information for every contact linked to a call in one round trip: the contact, its pre-incident plan, premise hazards, live alert notes and file metadata with signed download links (Contacts plan Phase A, decision 3b). This is the RMS/NERIS authoring prefill contract for calls linked to a Contact: additive changes only. Signed file links expire; do not persist them. `GET /Calls/GetCallSiteInfo` — legacy: DIRU. */
export const getCallSiteInfo = (ctx: ApiContext, params: { callId: string }, options?: RequestOptions): Promise<CallSiteInfoResult> => request<CallSiteInfoResult>(ctx, E.getCallSiteInfo, { params }, options);

/** Saves a call in the Resgrid system. `GET /Calls/GetNewCallFieldPolicy` — legacy: BDIRU. */
export const getNewCallFieldPolicy = (ctx: ApiContext, options?: RequestOptions): Promise<NewCallFieldPolicyResult> => request<NewCallFieldPolicyResult>(ctx, E.getNewCallFieldPolicy, {}, options);

/** Returns the department's pending calls: saved but not yet dispatched (State 8), oldest first. Pending calls come from Calls/SaveCall with IsPending, e.g. follow-ups fed in from another system, and wait here for a dispatcher to send them with Calls/DispatchCallNow. `GET /Calls/GetPendingCalls` — legacy: D. */
export const getPendingCalls = (ctx: ApiContext, options?: RequestOptions): Promise<PendingCallsResult> => request<PendingCallsResult>(ctx, E.getPendingCalls, {}, options);

/** `POST /Calls/SaveCall` — legacy: BDIRU. */
export const saveCall = (ctx: ApiContext, body: NewCallInput, options?: RequestOptions): Promise<SaveCallResult> => request<SaveCallResult>(ctx, E.saveCall, { body }, options);

/** Saves a call note. `POST /CallNotes/SaveCallNote` — legacy: BDIRU. */
export const saveCallNote = (ctx: ApiContext, body: SaveCallNoteInput, options?: RequestOptions): Promise<SaveCallNoteResult> => request<SaveCallNoteResult>(ctx, E.saveCallNote, { body }, options);

/** Updates a call's scheduled dispatch time if it has not been dispatched. `PUT /Calls/UpdateScheduledDispatchTime` — legacy: D. */
export const updateScheduledDispatchTime = (ctx: ApiContext, body: UpdateDispatchTimeInput, options?: RequestOptions): Promise<SaveCallResult> =>
  request<SaveCallResult>(ctx, E.updateScheduledDispatchTime, { body }, options);
