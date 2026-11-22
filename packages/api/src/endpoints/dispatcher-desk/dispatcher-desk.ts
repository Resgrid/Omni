import {
  type DispatcherAwayInput,
  type DispatcherBreakIdInput,
  type DispatcherBreaksResult,
  type DispatcherCallbackNumberInput,
  type DispatcherCompleteInput,
  type DispatcherCoverageResult,
  type DispatcherDeclineInput,
  DispatcherDeskActionResult,
  type DispatcherDeskConfigResult,
  type DispatcherDeskResult,
  type DispatcherDeviceInput,
  type DispatcherEndBreakInput,
  type DispatcherItemInput,
  type DispatcherLinkCallInput,
  type DispatcherMessageInput,
  type DispatcherPlanBreaksInput,
  type DispatcherQueueItemDetailResult,
  type DispatcherQueueResult,
  type DispatcherSaveBreakInput,
  type DispatcherSignInInput,
  type DispatcherStartBreakInput,
  type DispatcherStatsResult,
  type DispatcherTransferInput,
  type DispatcherVoiceInput,
  type ShiftDayDispatcherInput,
  type ShiftDispatchersResult,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, errorBodyString, joinUrl, request, type RequestOptions, toApiError } from '../../core';

/**
 * Core v4 endpoints of the dispatcher desk (`DispatcherDesk`, Core M0324, dispatchers-on-duty plan §4): the board, the
 * routed work queue and its items, presence (sign in, away, heartbeat), the Dispatch-only push subscriber, breaks and
 * coverage, and the shift day dispatch rosters. Every POST answers `DispatcherDeskActionResult` (a refusal names its
 * `DispatcherDeskErrors` value in `Error`). Nothing is cached: the desk acts on what is current. The contract test checks
 * every entry against Swagger.
 */
export const dispatcherDeskEndpoints = defineEndpoints('dispatcher-desk', {
  getDispatcherDesk: { method: 'GET', path: '/DispatcherDesk/GetDesk' },
  getDispatcherQueue: { method: 'GET', path: '/DispatcherDesk/GetQueue' },
  getDispatcherQueueItem: { method: 'GET', path: '/DispatcherDesk/GetItem', query: ['itemId'] },
  getDispatcherCoverage: { method: 'GET', path: '/DispatcherDesk/GetCoverage', query: ['from', 'to', 'slotMinutes'] },
  getDispatcherBreaks: { method: 'GET', path: '/DispatcherDesk/GetBreaks', query: ['from', 'to'] },
  getShiftDispatchers: { method: 'GET', path: '/DispatcherDesk/GetShiftDispatchers', query: ['shiftId', 'shiftDayId'] },
  getDispatcherStats: { method: 'GET', path: '/DispatcherDesk/GetStats', query: ['from', 'to'] },
  getDispatcherDeskConfig: { method: 'GET', path: '/DispatcherDesk/GetConfig' },
  signInToDispatcherDesk: { method: 'POST', path: '/DispatcherDesk/SignIn', body: 'json' },
  signOffDispatcherDesk: { method: 'POST', path: '/DispatcherDesk/SignOff' },
  sendDispatcherDeskHeartbeat: { method: 'POST', path: '/DispatcherDesk/Heartbeat' },
  setDispatcherAvailable: { method: 'POST', path: '/DispatcherDesk/SetAvailable' },
  setDispatcherAway: { method: 'POST', path: '/DispatcherDesk/SetAway', body: 'json' },
  setDispatcherCallbackNumber: { method: 'POST', path: '/DispatcherDesk/SetCallbackNumber', body: 'json' },
  registerDispatcherDeskDevice: { method: 'POST', path: '/DispatcherDesk/RegisterDevice', body: 'json' },
  unregisterDispatcherDeskDevice: { method: 'POST', path: '/DispatcherDesk/UnregisterDevice', body: 'json' },
  acceptDispatcherItem: { method: 'POST', path: '/DispatcherDesk/AcceptItem', body: 'json' },
  declineDispatcherItem: { method: 'POST', path: '/DispatcherDesk/DeclineItem', body: 'json' },
  releaseDispatcherItem: { method: 'POST', path: '/DispatcherDesk/ReleaseItem', body: 'json' },
  transferDispatcherItem: { method: 'POST', path: '/DispatcherDesk/TransferItem', body: 'json' },
  completeDispatcherItem: { method: 'POST', path: '/DispatcherDesk/CompleteItem', body: 'json' },
  linkDispatcherItemCall: { method: 'POST', path: '/DispatcherDesk/LinkCall', body: 'json' },
  sendDispatcherMessage: { method: 'POST', path: '/DispatcherDesk/SendMessage', body: 'json' },
  addDispatcherNote: { method: 'POST', path: '/DispatcherDesk/AddNote', body: 'json' },
  connectDispatcherVoice: { method: 'POST', path: '/DispatcherDesk/ConnectVoice', body: 'json' },
  callBackDispatcherCaller: { method: 'POST', path: '/DispatcherDesk/CallBack', body: 'json' },
  saveDispatcherBreak: { method: 'POST', path: '/DispatcherDesk/SaveBreak', body: 'json' },
  cancelDispatcherBreak: { method: 'POST', path: '/DispatcherDesk/CancelBreak', body: 'json' },
  startDispatcherBreak: { method: 'POST', path: '/DispatcherDesk/StartBreak', body: 'json' },
  endDispatcherBreak: { method: 'POST', path: '/DispatcherDesk/EndBreak', body: 'json' },
  planDispatcherBreaks: { method: 'POST', path: '/DispatcherDesk/PlanBreaks', body: 'json' },
  signupToDispatchForDay: { method: 'POST', path: '/DispatcherDesk/SignupForDay', body: 'json' },
  withdrawFromDispatchDay: { method: 'POST', path: '/DispatcherDesk/WithdrawFromDay', body: 'json' },
  assignDispatcherToDay: { method: 'POST', path: '/DispatcherDesk/AssignToDay', body: 'json' },
  removeDispatcherFromDay: { method: 'POST', path: '/DispatcherDesk/RemoveFromDay', body: 'json' },
});

const E = dispatcherDeskEndpoints;

/** A window of two ISO-8601 UTC instants; both left out = today in the department's time zone. */
export interface DispatcherDeskWindow {
  from?: string;
  to?: string;
}

/** The coverage timeline window and slot length (minutes; the server's default when left out). */
export interface DispatcherCoverageQuery extends DispatcherDeskWindow {
  slotMinutes?: number;
}

/** The whole board: config, me, members, the queue, my breaks and the coverage counts. `GET /DispatcherDesk/GetDesk`. */
export const getDispatcherDesk = (ctx: ApiContext, options?: RequestOptions): Promise<DispatcherDeskResult> => request<DispatcherDeskResult>(ctx, E.getDispatcherDesk, {}, options);

/** The open work the caller can see (queued, offered, accepted). `GET /DispatcherDesk/GetQueue`. */
export const getDispatcherQueue = (ctx: ApiContext, options?: RequestOptions): Promise<DispatcherQueueResult> => request<DispatcherQueueResult>(ctx, E.getDispatcherQueue, {}, options);

/** One item with its history and conversation. `GET /DispatcherDesk/GetItem`. */
export const getDispatcherQueueItem = (ctx: ApiContext, params: { itemId: string }, options?: RequestOptions): Promise<DispatcherQueueItemDetailResult> =>
  request<DispatcherQueueItemDetailResult>(ctx, E.getDispatcherQueueItem, { params }, options);

/** Duty windows, breaks and coverage slots for the team timeline. `GET /DispatcherDesk/GetCoverage`. */
export const getDispatcherCoverage = (ctx: ApiContext, params: DispatcherCoverageQuery = {}, options?: RequestOptions): Promise<DispatcherCoverageResult> =>
  request<DispatcherCoverageResult>(ctx, E.getDispatcherCoverage, { params }, options);

/** The caller's breaks in a window. `GET /DispatcherDesk/GetBreaks`. */
export const getDispatcherBreaks = (ctx: ApiContext, params: DispatcherDeskWindow = {}, options?: RequestOptions): Promise<DispatcherBreaksResult> =>
  request<DispatcherBreaksResult>(ctx, E.getDispatcherBreaks, { params }, options);

/** A shift's dispatcher settings and its standing or day roster. `GET /DispatcherDesk/GetShiftDispatchers`. */
export const getShiftDispatchers = (ctx: ApiContext, params: { shiftId: number; shiftDayId?: number }, options?: RequestOptions): Promise<ShiftDispatchersResult> =>
  request<ShiftDispatchersResult>(ctx, E.getShiftDispatchers, { params }, options);

/** Activity per dispatcher over a window (supervisors). `GET /DispatcherDesk/GetStats`. */
export const getDispatcherStats = (ctx: ApiContext, params: DispatcherDeskWindow = {}, options?: RequestOptions): Promise<DispatcherStatsResult> =>
  request<DispatcherStatsResult>(ctx, E.getDispatcherStats, { params }, options);

/** The department's desk settings. `GET /DispatcherDesk/GetConfig`. */
export const getDispatcherDeskConfig = (ctx: ApiContext, options?: RequestOptions): Promise<DispatcherDeskConfigResult> => request<DispatcherDeskConfigResult>(ctx, E.getDispatcherDeskConfig, {}, options);

/**
 * A desk refusal Core answers with an HTTP error status (a 4xx whose body names the `DispatcherDeskErrors` value) reads
 * the same as one it answers with 200: an action result with `Success` false and the `Error` name. Anything else
 * (no answer, 5xx, a 404 without a desk body from a Core that has no desk) is thrown as the `ApiError` it is.
 */
const asDeskAnswer = async (send: () => Promise<DispatcherDeskActionResult>): Promise<DispatcherDeskActionResult> => {
  try {
    return await send();
  } catch (error) {
    const apiError = toApiError(error);
    const refused = apiError.kind === 'http' && (apiError.status ?? 500) < 500;
    const refusal = refused ? errorBodyString(apiError, 'Error') : undefined;

    if (!refusal) throw apiError;
    const result = new DispatcherDeskActionResult();
    result.Status = 'failure';
    result.Error = refusal;

    return result;
  }
};

/**
 * Desk writes route the department's queue inside the request (sign-in, available, end of break, release, decline can
 * each hand out an offer before answering), so they get longer than the client's read default before giving up on an
 * answer that may still be coming.
 */
export const DESK_WRITE_TIMEOUT_MS = 30_000;

const post =
  <B>(definition: (typeof E)[keyof typeof E]) =>
  (ctx: ApiContext, body: B, options?: RequestOptions): Promise<DispatcherDeskActionResult> =>
    asDeskAnswer(() => request<DispatcherDeskActionResult>(ctx, definition, { body }, { timeoutMs: DESK_WRITE_TIMEOUT_MS, ...options }));

const postEmpty =
  (definition: (typeof E)[keyof typeof E]) =>
  (ctx: ApiContext, options?: RequestOptions): Promise<DispatcherDeskActionResult> =>
    asDeskAnswer(() => request<DispatcherDeskActionResult>(ctx, definition, {}, { timeoutMs: DESK_WRITE_TIMEOUT_MS, ...options }));

/** Signs in to the desk (on a shift, or unscheduled where allowed). `POST /DispatcherDesk/SignIn`. */
export const signInToDispatcherDesk = post<DispatcherSignInInput>(E.signInToDispatcherDesk);

/** Signs off the desk; held work goes back to the queue. `POST /DispatcherDesk/SignOff`. */
export const signOffDispatcherDesk = postEmpty(E.signOffDispatcherDesk);

/** "Still here" while the app is in the foreground. `POST /DispatcherDesk/Heartbeat`. */
export const sendDispatcherDeskHeartbeat = postEmpty(E.sendDispatcherDeskHeartbeat);

/** Back to taking work (from Away). `POST /DispatcherDesk/SetAvailable`. */
export const setDispatcherAvailable = postEmpty(E.setDispatcherAvailable);

/** Signed in but not taking routed work for now. `POST /DispatcherDesk/SetAway`. */
export const setDispatcherAway = post<DispatcherAwayInput>(E.setDispatcherAway);

/** The number the desk rings to connect a held caller. `POST /DispatcherDesk/SetCallbackNumber`. */
export const setDispatcherCallbackNumber = post<DispatcherCallbackNumberInput>(E.setDispatcherCallbackNumber);

/** Puts this device's push token on the Dispatch-only desk subscriber. `POST /DispatcherDesk/RegisterDevice`. */
export const registerDispatcherDeskDevice = post<DispatcherDeviceInput>(E.registerDispatcherDeskDevice);

/** Takes this device's push token off the desk subscriber. `POST /DispatcherDesk/UnregisterDevice`. */
export const unregisterDispatcherDeskDevice = post<DispatcherDeviceInput>(E.unregisterDispatcherDeskDevice);

/** Takes an item offered to the caller, or one waiting in the queue. `POST /DispatcherDesk/AcceptItem`. */
export const acceptDispatcherItem = post<DispatcherItemInput>(E.acceptDispatcherItem);

/** Turns an offer down; it goes to the next dispatcher. `POST /DispatcherDesk/DeclineItem`. */
export const declineDispatcherItem = post<DispatcherDeclineInput>(E.declineDispatcherItem);

/** Puts held work back in the queue. `POST /DispatcherDesk/ReleaseItem`. */
export const releaseDispatcherItem = post<DispatcherItemInput>(E.releaseDispatcherItem);

/** Hands held work to another on-duty dispatcher. `POST /DispatcherDesk/TransferItem`. */
export const transferDispatcherItem = post<DispatcherTransferInput>(E.transferDispatcherItem);

/** Finishes an item with an outcome. `POST /DispatcherDesk/CompleteItem`. */
export const completeDispatcherItem = post<DispatcherCompleteInput>(E.completeDispatcherItem);

/** Links the call created from a conversation to it. `POST /DispatcherDesk/LinkCall`. */
export const linkDispatcherItemCall = post<DispatcherLinkCallInput>(E.linkDispatcherItemCall);

/** Replies on the item's channel (text, email, chat). `POST /DispatcherDesk/SendMessage`. */
export const sendDispatcherMessage = post<DispatcherMessageInput>(E.sendDispatcherMessage);

/** Adds a desk note (never sent). `POST /DispatcherDesk/AddNote`. */
export const addDispatcherNote = post<DispatcherMessageInput>(E.addDispatcherNote);

/** Rings the dispatcher's phone and bridges the held caller. `POST /DispatcherDesk/ConnectVoice`. */
export const connectDispatcherVoice = post<DispatcherVoiceInput>(E.connectDispatcherVoice);

/** Calls an abandoned caller back through the desk. `POST /DispatcherDesk/CallBack`. */
export const callBackDispatcherCaller = post<DispatcherVoiceInput>(E.callBackDispatcherCaller);

/** Plans (or changes) a break. `POST /DispatcherDesk/SaveBreak`. */
export const saveDispatcherBreak = post<DispatcherSaveBreakInput>(E.saveDispatcherBreak);

/** Removes a planned break. `POST /DispatcherDesk/CancelBreak`. */
export const cancelDispatcherBreak = post<DispatcherBreakIdInput>(E.cancelDispatcherBreak);

/** Starts a planned break, or takes one now. `POST /DispatcherDesk/StartBreak`. */
export const startDispatcherBreak = post<DispatcherStartBreakInput>(E.startDispatcherBreak);

/** Ends a break ("I'm back"). `POST /DispatcherDesk/EndBreak`. */
export const endDispatcherBreak = post<DispatcherEndBreakInput>(E.endDispatcherBreak);

/** Staggers a shift day's break plan across its dispatchers. `POST /DispatcherDesk/PlanBreaks`. */
export const planDispatcherBreaks = post<DispatcherPlanBreaksInput>(E.planDispatcherBreaks);

/** Signs the caller up to dispatch on a shift day. `POST /DispatcherDesk/SignupForDay`. */
export const signupToDispatchForDay = post<ShiftDayDispatcherInput>(E.signupToDispatchForDay);

/** `POST /DispatcherDesk/WithdrawFromDay`. */
export const withdrawFromDispatchDay = post<ShiftDayDispatcherInput>(E.withdrawFromDispatchDay);

/** A shift manager puts a dispatcher on a shift day. `POST /DispatcherDesk/AssignToDay`. */
export const assignDispatcherToDay = post<ShiftDayDispatcherInput>(E.assignDispatcherToDay);

/** `POST /DispatcherDesk/RemoveFromDay`. */
export const removeDispatcherFromDay = post<ShiftDayDispatcherInput>(E.removeDispatcherFromDay);

/** The ended session the desk device registration belongs to (the sign-out hook contract: called directly, never through the API client). */
export interface EndedSessionRequest {
  /** The API base (`…/api/v4`) of the session that signed out. */
  baseUrl: string;
  accessToken: string;
  timeoutMs?: number;
}

/**
 * Takes this device's token off the desk subscriber as a session that has just signed out. The API client has already
 * stopped acting for that session (its 401 handling would re-enter sign-out), so this goes straight to the server with
 * the session's token. Quiet by design: it resolves whether or not the server took it.
 */
export const unregisterDispatcherDeskDeviceForEndedSession = async (session: EndedSessionRequest, body: DispatcherDeviceInput): Promise<boolean> => {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), session.timeoutMs ?? 3000) : null;

  try {
    const init: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify(body) };

    if (controller) init.signal = controller.signal;
    const response = await fetch(joinUrl(session.baseUrl, E.unregisterDispatcherDeskDevice.path), init);

    return response.ok;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
