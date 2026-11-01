import {
  assignToShiftDay,
  cancelShiftTrade,
  finishShiftTrade,
  getMyShifts,
  getOnDutyPersonnel,
  getOpenShiftTrades,
  getPendingApprovals,
  getShift,
  getShiftDay,
  getShiftDayPersonnelOptions,
  getShiftDaysForDateRange,
  getShifts,
  getShiftTrade,
  getShiftTrades,
  getTodaysShifts,
  getTradeCandidates,
  getWorkshiftDay,
  removeFromShiftDay,
  requestShiftTrade,
  requestWorkshiftTrade,
  respondToShiftTrade,
  reviewShiftSignup,
  reviewShiftTrade,
  signupForShiftDay,
  withdrawFromShiftDay,
} from '@resgrid/api';
import type { OnDutyPersonResultData, PendingApprovalsResultData, ShiftActionResult, ShiftDayResultData, ShiftErrorCode, ShiftPersonOptionResultData, ShiftResultData, ShiftTradeResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapItem, unwrapList } from '../core/envelope';
import { toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/** What a shift mutation did. `errorCode` is the server `ErrorCode` (or `network` / `unknown`) when it failed (Responder). */
export interface ShiftActionOutcome {
  success: boolean;
  errorCode: ShiftErrorCode | null;
  approvalPending: boolean;
  id: string;
}

/** Lists a mutation can change; each is refetched after it succeeds. */
export type ShiftRefreshScope = 'today' | 'mine' | 'calendar' | 'trades' | 'approvals' | 'onduty';

type ShiftsSlice = 'shifts' | 'today' | 'mine' | 'calendar' | 'trades' | 'openTrades' | 'approvals' | 'onDuty' | 'shift' | 'shiftDay' | 'trade' | 'candidates' | 'personnelOptions';

interface ShiftsData extends SliceMeta<ShiftsSlice> {
  shifts: ShiftResultData[];
  todaysShiftDays: ShiftDayResultData[];
  myShiftDays: ShiftDayResultData[];
  calendarDays: ShiftDayResultData[];
  calendarRange: { start: string; end: string; shiftId: string | null } | null;
  trades: ShiftTradeResultData[];
  openTrades: ShiftTradeResultData[];
  pendingApprovals: PendingApprovalsResultData | null;
  onDutyPersonnel: OnDutyPersonResultData[];
  shiftsById: Record<string, ShiftResultData>;
  shiftDaysById: Record<string, ShiftDayResultData>;
  tradesById: Record<string, ShiftTradeResultData>;
  tradeCandidatesByDay: Record<string, ShiftPersonOptionResultData[]>;
  personnelOptionsByDay: Record<string, ShiftPersonOptionResultData[]>;
}

export interface ShiftsState extends ShiftsData {
  init: (options?: FetchOptions) => Promise<void>;
  fetchAllShifts: (options?: FetchOptions) => Promise<void>;
  fetchTodaysShifts: (options?: FetchOptions) => Promise<void>;
  fetchMyShifts: (range?: { start?: string; end?: string }, options?: FetchOptions) => Promise<void>;
  fetchShiftDaysForDateRange: (start: string, end: string, shiftId?: string | null, options?: FetchOptions) => Promise<void>;
  fetchShiftTrades: (options?: FetchOptions) => Promise<void>;
  fetchOpenTrades: (options?: FetchOptions) => Promise<void>;
  fetchPendingApprovals: (options?: FetchOptions) => Promise<void>;
  fetchOnDutyPersonnel: (options?: FetchOptions) => Promise<void>;
  fetchShift: (shiftId: string, options?: FetchOptions) => Promise<void>;
  /** Static shift (workshift) days have their own endpoint (`StaffedShiftTypes.Workshift`). */
  fetchShiftDay: (shiftDayId: string, options?: FetchOptions & { workshift?: boolean }) => Promise<void>;
  fetchTradeDetail: (tradeId: string, options?: FetchOptions) => Promise<void>;
  fetchTradeCandidates: (shiftDayId: string) => Promise<void>;
  fetchPersonnelOptions: (shiftDayId: string) => Promise<void>;
  refreshAfterMutation: (scopes: ShiftRefreshScope[]) => Promise<void>;
  // Mutations are online only: each returns the server outcome code for the UI to translate.
  signupForShift: (shiftDayId: string, groupId: string) => Promise<ShiftActionOutcome>;
  withdrawFromShift: (shiftSignupId: string) => Promise<ShiftActionOutcome>;
  requestTrade: (shiftDayId: string, userIds: string[], note: string, options?: { workshift?: boolean }) => Promise<ShiftActionOutcome>;
  respondToTrade: (tradeId: string, accept: boolean, note: string, offeredShiftSignupIds?: string[]) => Promise<ShiftActionOutcome>;
  finishTrade: (tradeId: string, acceptedUserId: string, targetShiftSignupId: string | null) => Promise<ShiftActionOutcome>;
  cancelTrade: (tradeId: string) => Promise<ShiftActionOutcome>;
  reviewSignup: (shiftSignupId: string, approve: boolean, note: string) => Promise<ShiftActionOutcome>;
  reviewTrade: (tradeId: string, approve: boolean, note: string) => Promise<ShiftActionOutcome>;
  assignToShiftDay: (shiftDayId: string, userId: string, groupId: string) => Promise<ShiftActionOutcome>;
  removeFromShiftDay: (shiftDayId: string, userId: string, note: string) => Promise<ShiftActionOutcome>;
}

const initialData = (): ShiftsData => ({
  ...emptySliceMeta<ShiftsSlice>(),
  shifts: [],
  todaysShiftDays: [],
  myShiftDays: [],
  calendarDays: [],
  calendarRange: null,
  trades: [],
  openTrades: [],
  pendingApprovals: null,
  onDutyPersonnel: [],
  shiftsById: {},
  shiftDaysById: {},
  tradesById: {},
  tradeCandidatesByDay: {},
  personnelOptionsByDay: {},
});

const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Server outcome → UI outcome (Responder `getShiftResponseErrorCode` / `getShiftRequestErrorCode`). */
export const toShiftOutcome = (result: ShiftActionResult | null): ShiftActionOutcome => {
  const errorCode = result?.ErrorCode ? (result.ErrorCode as ShiftErrorCode) : null;
  const failed = errorCode !== null || (typeof result?.Status === 'string' && result.Status.toLowerCase() === 'failure');
  return { success: !failed, errorCode: failed ? (errorCode ?? 'unknown') : null, approvalPending: result?.ApprovalPending === true, id: result?.Id ?? '' };
};

const failureOutcome = (error: unknown): ShiftActionOutcome => {
  const code = toDataError(error).code;
  return { success: false, errorCode: code === 'network' || code === 'timeout' ? 'network' : 'unknown', approvalPending: false, id: '' };
};

let runner: SliceRunner<ShiftsSlice, ShiftsState>;

export const useShiftsStore = create<ShiftsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<ShiftsSlice, ShiftsState>('shifts', set);
      const ctx = () => getDataApiContext();
      const mutate = async (fn: () => Promise<ShiftActionResult>, scopes: ShiftRefreshScope[]): Promise<ShiftActionOutcome> => {
        try {
          const outcome = toShiftOutcome(await fn());
          if (outcome.success) await get().refreshAfterMutation(scopes);
          return outcome;
        } catch (error) {
          return failureOutcome(error);
        }
      };

      return {
        ...initialData(),

        init: async (options) => {
          await Promise.all([get().fetchAllShifts(options), get().fetchTodaysShifts(options), get().fetchMyShifts(undefined, options)]);
        },
        fetchAllShifts: async () => {
          await runner.run(
            'shifts',
            async () => unwrapList(await getShifts(ctx())),
            (shifts) => ({ shifts })
          );
        },
        fetchTodaysShifts: async () => {
          await runner.run(
            'today',
            async () => unwrapList(await getTodaysShifts(ctx())),
            (todaysShiftDays) => ({ todaysShiftDays })
          );
        },
        fetchMyShifts: async (range) => {
          await runner.run(
            'mine',
            async () => unwrapList(await getMyShifts(ctx(), { start: range?.start, end: range?.end })),
            (myShiftDays) => ({ myShiftDays })
          );
        },
        fetchShiftDaysForDateRange: async (start, end, shiftId) => {
          await runner.run(
            'calendar',
            async () => unwrapList(await getShiftDaysForDateRange(ctx(), { start, end, ...(shiftId ? { shiftId } : {}) })),
            (calendarDays) => ({ calendarDays, calendarRange: { start, end, shiftId: shiftId ?? null } }),
            { flightKey: `calendar:${start}|${end}|${shiftId ?? ''}` }
          );
        },
        fetchShiftTrades: async () => {
          await runner.run(
            'trades',
            async () => unwrapList(await getShiftTrades(ctx())),
            (trades) => ({ trades })
          );
        },
        fetchOpenTrades: async () => {
          await runner.run(
            'openTrades',
            async () => unwrapList(await getOpenShiftTrades(ctx())),
            (openTrades) => ({ openTrades })
          );
        },
        fetchPendingApprovals: async () => {
          await runner.run(
            'approvals',
            async () => unwrapItem(await getPendingApprovals(ctx())),
            (pendingApprovals) => ({ pendingApprovals })
          );
        },
        fetchOnDutyPersonnel: async () => {
          await runner.run(
            'onDuty',
            async () => unwrapList(await getOnDutyPersonnel(ctx())),
            (onDutyPersonnel) => ({ onDutyPersonnel })
          );
        },
        fetchShift: async (shiftId) => {
          await runner.run(
            'shift',
            async () => unwrapItem(await getShift(ctx(), { id: shiftId })),
            (shift, state) => (shift ? { shiftsById: { ...state.shiftsById, [shiftId]: shift } } : {}),
            { flightKey: `shift:${shiftId}` }
          );
        },
        fetchShiftDay: async (shiftDayId, options) => {
          await runner.run(
            'shiftDay',
            async () => unwrapItem(options?.workshift ? await getWorkshiftDay(ctx(), { id: shiftDayId }) : await getShiftDay(ctx(), { id: shiftDayId })),
            (day, state) => (day ? { shiftDaysById: { ...state.shiftDaysById, [shiftDayId]: day } } : {}),
            { flightKey: `shiftDay:${shiftDayId}` }
          );
        },
        fetchTradeDetail: async (tradeId) => {
          await runner.run(
            'trade',
            async () => unwrapItem(await getShiftTrade(ctx(), { id: tradeId })),
            (trade, state) => (trade ? { tradesById: { ...state.tradesById, [tradeId]: trade } } : {}),
            { flightKey: `trade:${tradeId}` }
          );
        },
        fetchTradeCandidates: async (shiftDayId) => {
          await runner.run(
            'candidates',
            async () => unwrapList(await getTradeCandidates(ctx(), { shiftDayId })),
            (list, state) => ({ tradeCandidatesByDay: { ...state.tradeCandidatesByDay, [shiftDayId]: list } }),
            { flightKey: `candidates:${shiftDayId}` }
          );
        },
        fetchPersonnelOptions: async (shiftDayId) => {
          await runner.run(
            'personnelOptions',
            async () => unwrapList(await getShiftDayPersonnelOptions(ctx(), { shiftDayId })),
            (list, state) => ({ personnelOptionsByDay: { ...state.personnelOptionsByDay, [shiftDayId]: list } }),
            { flightKey: `personnelOptions:${shiftDayId}` }
          );
        },
        refreshAfterMutation: async (scopes) => {
          const state = get();
          const tasks: Promise<void>[] = [];
          if (scopes.includes('today')) tasks.push(state.fetchTodaysShifts({ bypassCache: true }));
          if (scopes.includes('mine')) tasks.push(state.fetchMyShifts(undefined, { bypassCache: true }));
          if (scopes.includes('calendar') && state.calendarRange) tasks.push(state.fetchShiftDaysForDateRange(state.calendarRange.start, state.calendarRange.end, state.calendarRange.shiftId));
          if (scopes.includes('trades')) tasks.push(state.fetchShiftTrades(), state.fetchOpenTrades());
          if (scopes.includes('approvals')) tasks.push(state.fetchPendingApprovals());
          if (scopes.includes('onduty')) tasks.push(state.fetchOnDutyPersonnel());
          await Promise.all(tasks);
        },

        signupForShift: (shiftDayId, groupId) =>
          mutate(async () => (await signupForShiftDay(ctx(), { ShiftDayId: num(shiftDayId), GroupId: num(groupId) })) as unknown as ShiftActionResult, ['today', 'mine', 'calendar']),
        withdrawFromShift: (shiftSignupId) => mutate(() => withdrawFromShiftDay(ctx(), { ShiftSignupId: num(shiftSignupId) }), ['today', 'mine', 'calendar']),
        requestTrade: (shiftDayId, userIds, note, options) =>
          mutate(
            () => (options?.workshift ? requestWorkshiftTrade(ctx(), { WorkshiftDayId: shiftDayId, Note: note }) : requestShiftTrade(ctx(), { ShiftDayId: num(shiftDayId), UserIds: userIds, Note: note })),
            ['trades', 'mine']
          ),
        respondToTrade: (tradeId, accept, note, offered) =>
          mutate(() => respondToShiftTrade(ctx(), { ShiftSignupTradeId: num(tradeId), Accept: accept, Note: note, OfferedShiftSignupIds: offered ? offered.map(num) : null }), ['trades', 'mine']),
        finishTrade: (tradeId, acceptedUserId, targetShiftSignupId) =>
          mutate(
            () => finishShiftTrade(ctx(), { ShiftSignupTradeId: num(tradeId), AcceptedUserId: acceptedUserId, TargetShiftSignupId: targetShiftSignupId === null ? null : num(targetShiftSignupId) }),
            ['trades', 'mine', 'calendar']
          ),
        cancelTrade: (tradeId) => mutate(() => cancelShiftTrade(ctx(), { ShiftSignupTradeId: num(tradeId) }), ['trades']),
        reviewSignup: (shiftSignupId, approve, note) => mutate(() => reviewShiftSignup(ctx(), { ShiftSignupId: num(shiftSignupId), Approve: approve, Note: note }), ['approvals', 'calendar']),
        reviewTrade: (tradeId, approve, note) => mutate(() => reviewShiftTrade(ctx(), { ShiftSignupTradeId: num(tradeId), Approve: approve, Note: note }), ['approvals', 'trades']),
        assignToShiftDay: (shiftDayId, userId, groupId) => mutate(() => assignToShiftDay(ctx(), { ShiftDayId: num(shiftDayId), UserId: userId, GroupId: num(groupId) }), ['calendar', 'today', 'onduty']),
        removeFromShiftDay: (shiftDayId, userId, note) => mutate(() => removeFromShiftDay(ctx(), { ShiftDayId: num(shiftDayId), UserId: userId, Note: note }), ['calendar', 'today', 'onduty']),
      };
    },
    dataPersistOptions<ShiftsState, Pick<ShiftsData, 'shifts' | 'todaysShiftDays' | 'myShiftDays' | 'onDutyPersonnel' | 'fetchedAt'>>({
      name: 'omni-shifts-storage',
      // Own shifts and today's roster for offline reading (plan §8.5 Responder).
      partialize: (state) => ({ shifts: state.shifts, todaysShiftDays: state.todaysShiftDays, myShiftDays: state.myShiftDays, onDutyPersonnel: state.onDutyPersonnel, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-shifts-storage', useShiftsStore);
registerDataStoreReset<ShiftsState>('shifts', useShiftsStore, initialData, () => runner.invalidate());
