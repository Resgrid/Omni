import type {
  AssignToShiftDayInput,
  CancelShiftTradeInput,
  FinishShiftTradeInput,
  OnDutyPersonnelResult,
  PendingApprovalsResult,
  RemoveFromShiftDayInput,
  RequestShiftTradeInput,
  RequestWorkshiftTradeInput,
  RespondToShiftTradeInput,
  ReviewShiftSignupInput,
  ReviewShiftTradeInput,
  ShiftActionResult,
  ShiftDayResult,
  ShiftDaysResult,
  ShiftPersonOptionsResult,
  ShiftResult,
  ShiftsResult,
  ShiftTradeResult,
  ShiftTradesResult,
  SignupShiftDayResult,
  WithdrawShiftSignupInput,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for shifts (Shifts). The contract test checks every entry against Swagger. */
export const shiftsEndpoints = defineEndpoints('shifts', {
  assignToShiftDay: { method: 'POST', path: '/Shifts/AssignToShiftDay', body: 'json' },
  cancelShiftTrade: { method: 'POST', path: '/Shifts/CancelShiftTrade', body: 'json' },
  finishShiftTrade: { method: 'POST', path: '/Shifts/FinishShiftTrade', body: 'json' },
  getMyShifts: { method: 'GET', path: '/Shifts/GetMyShifts', query: ['start', 'end'] },
  getOnDutyPersonnel: { method: 'GET', path: '/Shifts/GetOnDutyPersonnel' },
  getOpenShiftTrades: { method: 'GET', path: '/Shifts/GetOpenShiftTrades' },
  getPendingApprovals: { method: 'GET', path: '/Shifts/GetPendingApprovals' },
  getShift: { method: 'GET', path: '/Shifts/GetShift', query: ['id', 'shiftId'] },
  getShiftDay: { method: 'GET', path: '/Shifts/GetShiftDay', query: ['id', 'shiftDayId'] },
  getShiftDayPersonnelOptions: { method: 'GET', path: '/Shifts/GetShiftDayPersonnelOptions', query: ['shiftDayId'] },
  getShiftDaysForDateRange: { method: 'GET', path: '/Shifts/GetShiftDaysForDateRange', query: ['start', 'end', 'shiftId'] },
  getShifts: { method: 'GET', path: '/Shifts/GetShifts' },
  getShiftTrade: { method: 'GET', path: '/Shifts/GetShiftTrade', query: ['id'] },
  getShiftTrades: { method: 'GET', path: '/Shifts/GetShiftTrades' },
  getTodaysShifts: { method: 'GET', path: '/Shifts/GetTodaysShifts' },
  getTradeCandidates: { method: 'GET', path: '/Shifts/GetTradeCandidates', query: ['shiftDayId'] },
  getWorkshiftDay: { method: 'GET', path: '/Shifts/GetWorkshiftDay', query: ['id'] },
  getWorkshiftDays: { method: 'GET', path: '/Shifts/GetWorkshiftDays', query: ['start', 'end', 'mine'] },
  removeFromShiftDay: { method: 'POST', path: '/Shifts/RemoveFromShiftDay', body: 'json' },
  requestShiftTrade: { method: 'POST', path: '/Shifts/RequestShiftTrade', body: 'json' },
  requestWorkshiftTrade: { method: 'POST', path: '/Shifts/RequestWorkshiftTrade', body: 'json' },
  respondToShiftTrade: { method: 'POST', path: '/Shifts/RespondToShiftTrade', body: 'json' },
  reviewShiftSignup: { method: 'POST', path: '/Shifts/ReviewShiftSignup', body: 'json' },
  reviewShiftTrade: { method: 'POST', path: '/Shifts/ReviewShiftTrade', body: 'json' },
  signupForShiftDay: { method: 'POST', path: '/Shifts/SignupForShiftDay', body: 'json' },
  withdrawFromShiftDay: { method: 'POST', path: '/Shifts/WithdrawFromShiftDay', body: 'json' },
});

const E = shiftsEndpoints;

/** A supervisor adds a person to one shift day, in a group they supervise. `POST /Shifts/AssignToShiftDay` — legacy: R. */
export const assignToShiftDay = (ctx: ApiContext, body: AssignToShiftDayInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.assignToShiftDay, { body }, options);

/** Withdraws a trade that has not taken effect: the requester's own, or one in a slot the caller supervises. The requester and everyone who applied are told. `POST /Shifts/CancelShiftTrade` — legacy: R. */
export const cancelShiftTrade = (ctx: ApiContext, body: CancelShiftTradeInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.cancelShiftTrade, { body }, options);

/** Picks who takes the slot: a user taking it outright, or one of the offered swap-back days. The requester may pick when the department lets requesters decide; department admins, group admins (when allowed) and members of the department's approver roles may pick for anyone, and their pick needs no further approval. `POST /Shifts/FinishShiftTrade` — legacy: R. */
export const finishShiftTrade = (ctx: ApiContext, body: FinishShiftTradeInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.finishShiftTrade, { body }, options);

/** Gets the shift days the caller is on (or waiting for approval on), default today to 30 days out. `GET /Shifts/GetMyShifts` — legacy: R. */
export const getMyShifts = (ctx: ApiContext, params: { start?: string; end?: string } = {}, options?: RequestOptions): Promise<ShiftDaysResult> => request<ShiftDaysResult>(ctx, E.getMyShifts, { params }, options);

/** Everyone on duty right now: approved roster entries on every running shift day, trades applied. `GET /Shifts/GetOnDutyPersonnel` — legacy: R. */
export const getOnDutyPersonnel = (ctx: ApiContext, options?: RequestOptions): Promise<OnDutyPersonnelResult> => request<OnDutyPersonnelResult>(ctx, E.getOnDutyPersonnel, {}, options);

/** Open trade requests in the department that are still taking applicants, with whether the caller may apply. `GET /Shifts/GetOpenShiftTrades` — legacy: R. */
export const getOpenShiftTrades = (ctx: ApiContext, options?: RequestOptions): Promise<ShiftTradesResult> => request<ShiftTradesResult>(ctx, E.getOpenShiftTrades, {}, options);

/** Signups and trades waiting for approval in the groups the caller supervises. `GET /Shifts/GetPendingApprovals` — legacy: R. */
export const getPendingApprovals = (ctx: ApiContext, options?: RequestOptions): Promise<PendingApprovalsResult> => request<PendingApprovalsResult>(ctx, E.getPendingApprovals, {}, options);

/** Gets a single shift. `GET /Shifts/GetShift` — legacy: BDR. */
export const getShift = (ctx: ApiContext, params: { id: number | string; shiftId?: number | string }, options?: RequestOptions): Promise<ShiftResult> => request<ShiftResult>(ctx, E.getShift, { params }, options);

/** Gets a shift day with its roster, needs and the caller's status. `GET /Shifts/GetShiftDay` — legacy: BDR. */
export const getShiftDay = (ctx: ApiContext, params: { id: number | string; shiftDayId?: number | string }, options?: RequestOptions): Promise<ShiftDayResult> =>
  request<ShiftDayResult>(ctx, E.getShiftDay, { params }, options);

/** Department personnel who are not on a shift day, for a supervisor to add. `GET /Shifts/GetShiftDayPersonnelOptions` — legacy: R. */
export const getShiftDayPersonnelOptions = (ctx: ApiContext, params: { shiftDayId: number | string }, options?: RequestOptions): Promise<ShiftPersonOptionsResult> =>
  request<ShiftPersonOptionsResult>(ctx, E.getShiftDayPersonnelOptions, { params }, options);

/** Gets the department's shift days in a date range (department local dates, inclusive, at most 62 days). `GET /Shifts/GetShiftDaysForDateRange` — legacy: R. */
export const getShiftDaysForDateRange = (ctx: ApiContext, params: { start?: string; end?: string; shiftId?: number | string } = {}, options?: RequestOptions): Promise<ShiftDaysResult> =>
  request<ShiftDaysResult>(ctx, E.getShiftDaysForDateRange, { params }, options);

/** Gets all the shifts in a department. `GET /Shifts/GetShifts` — legacy: BDR. */
export const getShifts = (ctx: ApiContext, options?: RequestOptions): Promise<ShiftsResult> => request<ShiftsResult>(ctx, E.getShifts, {}, options);

/** One trade. The requester and the people who may decide it also get what they need to choose between applicants: each applicant's group, roles, current certifications, whether they still qualify, how much they are working in the week either side, and any shift they are already on that overlaps. Anyone else sees an open request, or one they were asked to take, without other applicants' notes. `GET /Shifts/GetShiftTrade` — legacy: R. */
export const getShiftTrade = (ctx: ApiContext, params: { id: number | string }, options?: RequestOptions): Promise<ShiftTradeResult> => request<ShiftTradeResult>(ctx, E.getShiftTrade, { params }, options);

/** Gets the trades the caller started or was asked to take. `GET /Shifts/GetShiftTrades` — legacy: R. */
export const getShiftTrades = (ctx: ApiContext, options?: RequestOptions): Promise<ShiftTradesResult> => request<ShiftTradesResult>(ctx, E.getShiftTrades, {}, options);

/** Gets today's shift days (department local date), plus a night shift from yesterday that is still running. `GET /Shifts/GetTodaysShifts` — legacy: BDR. */
export const getTodaysShifts = (ctx: ApiContext, options?: RequestOptions): Promise<ShiftDaysResult> => request<ShiftDaysResult>(ctx, E.getTodaysShifts, {}, options);

/** People the caller can ask to take their slot on a shift day: not on that day, and holding the roles the slot's group requires that the caller holds. `GET /Shifts/GetTradeCandidates` — legacy: R. */
export const getTradeCandidates = (ctx: ApiContext, params: { shiftDayId: number | string }, options?: RequestOptions): Promise<ShiftPersonOptionsResult> =>
  request<ShiftPersonOptionsResult>(ctx, E.getTradeCandidates, { params }, options);

/** One static shift (workshift) day with who is staffing it. `GET /Shifts/GetWorkshiftDay` — legacy: R. */
export const getWorkshiftDay = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<ShiftDayResult> => request<ShiftDayResult>(ctx, E.getWorkshiftDay, { params }, options);

/** Static shift (workshift) days in a date range (department local dates, inclusive, at most 62 days; default today to 30 days out), in the same shape as shift days with ShiftType 2. mine keeps only the days the caller is staffing. `GET /Shifts/GetWorkshiftDays` — legacy: R. */
export const getWorkshiftDays = (ctx: ApiContext, params: { start?: string; end?: string; mine?: boolean } = {}, options?: RequestOptions): Promise<ShiftDaysResult> =>
  request<ShiftDaysResult>(ctx, E.getWorkshiftDays, { params }, options);

/** A supervisor takes a person off one shift day. `POST /Shifts/RemoveFromShiftDay` — legacy: R. */
export const removeFromShiftDay = (ctx: ApiContext, body: RemoveFromShiftDayInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.removeFromShiftDay, { body }, options);

/** Asks to trade out of the caller's slot on a shift day. With no UserIds the request is open: everyone eligible for the slot is told and may apply. With UserIds only those people are asked. `POST /Shifts/RequestShiftTrade` — legacy: R. */
export const requestShiftTrade = (ctx: ApiContext, body: RequestShiftTradeInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.requestShiftTrade, { body }, options);

/** Asks to trade out of a static shift (workshift) day the caller is staffing. The request is open: everyone eligible is told and may apply. `POST /Shifts/RequestWorkshiftTrade` — legacy: R. */
export const requestWorkshiftTrade = (ctx: ApiContext, body: RequestWorkshiftTradeInput, options?: RequestOptions): Promise<ShiftActionResult> =>
  request<ShiftActionResult>(ctx, E.requestWorkshiftTrade, { body }, options);

/** Accepts (optionally offering days back) or declines a trade the caller was asked to take. `POST /Shifts/RespondToShiftTrade` — legacy: R. */
export const respondToShiftTrade = (ctx: ApiContext, body: RespondToShiftTradeInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.respondToShiftTrade, { body }, options);

/** A supervisor approves or denies a pending signup. `POST /Shifts/ReviewShiftSignup` — legacy: R. */
export const reviewShiftSignup = (ctx: ApiContext, body: ReviewShiftSignupInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.reviewShiftSignup, { body }, options);

/** A supervisor approves or denies a trade waiting for approval. `POST /Shifts/ReviewShiftTrade` — legacy: R. */
export const reviewShiftTrade = (ctx: ApiContext, body: ReviewShiftTradeInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.reviewShiftTrade, { body }, options);

/** Signs the caller up for a slot (group) on a shift day. On a shift that requires approval the signup waits for a supervisor. `POST /Shifts/SignupForShiftDay` — legacy: BDR. */
export const signupForShiftDay = (ctx: ApiContext, body: Record<string, unknown>, options?: RequestOptions): Promise<SignupShiftDayResult> => request<SignupShiftDayResult>(ctx, E.signupForShiftDay, { body }, options);

/** Withdraws a signup (the caller's own, or one in a group the caller supervises). `POST /Shifts/WithdrawFromShiftDay` — legacy: R. */
export const withdrawFromShiftDay = (ctx: ApiContext, body: WithdrawShiftSignupInput, options?: RequestOptions): Promise<ShiftActionResult> => request<ShiftActionResult>(ctx, E.withdrawFromShiftDay, { body }, options);
