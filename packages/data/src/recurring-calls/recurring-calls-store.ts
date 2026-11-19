import {
  createOccurrenceCall,
  deleteRecurringCall,
  dispatchOccurrenceNow,
  getRecurringCall,
  getRecurringCallOptions,
  getRecurringCalls,
  getScheduledCallsCalendar,
  pauseRecurringCall,
  restoreOccurrence,
  resumeRecurringCall,
  saveRecurringCall,
  skipOccurrence,
} from '@resgrid/api';
import type {
  PauseRecurringCallInput,
  RecurringCallActionResult,
  RecurringCallDetailResultData,
  RecurringCallInput,
  RecurringCallOccurrenceInput,
  RecurringCallOccurrenceResult,
  RecurringCallOptionsResultData,
  RecurringCallResultData,
  SaveRecurringCallResultData,
  ScheduledCallCalendarEntryData,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useCallsStore } from '../calls/calls-store';
import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { createKeyedFlight } from '../core/keyed-flight';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { useRecurringCallAlertsStore } from './recurring-call-alerts-store';

/**
 * Recurring calls (Dispatch, Core M0319): the department's schedules, one schedule's detail, the form options and the
 * scheduled calls calendar, plus the schedule writes and the per-occurrence actions (send now, create the call, skip,
 * restore). Every write is online only and never queued: sending a call late, or twice, pages people, so a dispatcher
 * retries by hand. After a write the lists it changes (schedules, calendar, alerts, pending and scheduled calls) are
 * read again. The schedule list and the form options persist for offline reads.
 */

type RecurringSlice = 'list' | 'detail' | 'options' | 'calendar';

/** The calendar window a screen asked for: two ISO-8601 UTC instants. */
export interface RecurringCallsCalendarWindow {
  start: string;
  end: string;
}

/** What a schedule write did: `message` is the server's plain-English outcome when it sent one. */
export interface RecurringCallActionOutcome {
  ok: boolean;
  message: string | null;
  /** The schedule as the server left it (pause and resume answer with it). */
  schedule: RecurringCallResultData | null;
  error: DataError | null;
}

/** What an occurrence action did. `outcome` is Core's word for it (Dispatched, Held, Created, Skipped, Restored, ...). */
export interface RecurringOccurrenceOutcome {
  ok: boolean;
  outcome: string | null;
  callId: number | null;
  callNumber: string | null;
  /** The call's state: 0 active (scheduled or sent), 8 pending (held). */
  callState: number | null;
  error: DataError | null;
}

export type RecurringOccurrenceAction = 'dispatch' | 'create' | 'skip' | 'restore';

/** The schedule writes, as the logs name them. */
type ScheduleOperation = 'pause' | 'resume' | 'delete';

interface RecurringCallsData extends SliceMeta<RecurringSlice> {
  /** Every schedule of the department, paused and ended ones included, in the server's order. */
  schedules: RecurringCallResultData[];
  /** Loaded schedule details by id. */
  details: Record<string, RecurringCallDetailResultData>;
  /** Why a schedule's detail could not be read, by id (`not_found` once it was deleted). */
  detailErrors: Record<string, DataError>;
  options: RecurringCallOptionsResultData | null;
  /** The window the calendar entries belong to (the last one that loaded). */
  calendarWindow: RecurringCallsCalendarWindow | null;
  /** The window the screen asked for last: only its answer replaces the entries. */
  calendarRequest: RecurringCallsCalendarWindow | null;
  calendar: ScheduledCallCalendarEntryData[];
  /** The writes in flight (`schedule:<id>` or `occurrence:<id>@<instant>`), so their buttons can spin. One per key. */
  busyKeys: string[];
}

export interface RecurringCallsState extends RecurringCallsData {
  fetchRecurringCalls: (options?: FetchOptions) => Promise<void>;
  fetchRecurringCall: (recurringCallId: number, options?: FetchOptions) => Promise<RecurringCallDetailResultData | null>;
  /** Loads the form options once per session; `force` reads them again. */
  fetchOptions: (force?: boolean) => Promise<RecurringCallOptionsResultData | null>;
  fetchCalendar: (window: RecurringCallsCalendarWindow, options?: FetchOptions) => Promise<void>;
  /**
   * Creates or updates a schedule. Throws what the request threw: a 400 carries the server's validation keys in its body
   * (`Errors`), which the form reads and words itself. A timeout or server error may still have saved it, so the lists are
   * read again before the error is thrown (the save itself never is).
   */
  saveRecurringCall: (input: RecurringCallInput) => Promise<SaveRecurringCallResultData | null>;
  pauseRecurringCall: (input: PauseRecurringCallInput) => Promise<RecurringCallActionOutcome>;
  resumeRecurringCall: (recurringCallId: number) => Promise<RecurringCallActionOutcome>;
  deleteRecurringCall: (recurringCallId: number, deleteUpcomingCalls: boolean) => Promise<RecurringCallActionOutcome>;
  /** A second action on an occurrence (like a second write on a schedule) while one runs joins the one in flight. */
  runOccurrenceAction: (action: RecurringOccurrenceAction, occurrence: RecurringCallOccurrenceInput) => Promise<RecurringOccurrenceOutcome>;
}

/** The busy key of a schedule write (pause, resume, delete, save). */
export const recurringScheduleKey = (recurringCallId: number): string => `schedule:${recurringCallId}`;

/** The busy key of an occurrence action: one occurrence is one schedule and one instant. */
export const recurringOccurrenceKey = (occurrence: RecurringCallOccurrenceInput): string => `occurrence:${occurrence.RecurringCallId}@${occurrence.OccurrenceOn}`;

const initialData = (): RecurringCallsData => ({
  ...emptySliceMeta<RecurringSlice>(),
  schedules: [],
  details: {},
  detailErrors: {},
  options: null,
  calendarWindow: null,
  calendarRequest: null,
  calendar: [],
  busyKeys: [],
});

const OCCURRENCE_ACTIONS: Record<RecurringOccurrenceAction, (input: RecurringCallOccurrenceInput) => Promise<RecurringCallOccurrenceResult>> = {
  dispatch: (input) => dispatchOccurrenceNow(getDataApiContext(), input),
  create: (input) => createOccurrenceCall(getDataApiContext(), input),
  skip: (input) => skipOccurrence(getDataApiContext(), input),
  restore: (input) => restoreOccurrence(getDataApiContext(), input),
};

/** A schedule the server no longer has (deleted elsewhere): `not_found` envelope or HTTP 404. */
const NOT_FOUND: DataError = { code: 'not_found', messageKey: 'errors.data.not_found' };

const failedOccurrence = (error: DataError): RecurringOccurrenceOutcome => ({ ok: false, outcome: null, callId: null, callNumber: null, callState: null, error });

const withoutKey = <V>(record: Record<string, V>, key: string): Record<string, V> => Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));

const sameWindow = (a: RecurringCallsCalendarWindow | null, b: RecurringCallsCalendarWindow): boolean => a?.start === b.start && a?.end === b.end;

/** A failed write the server may still have made: no answer, a timeout or a server error. */
const mayHaveCommitted = (error: DataError): boolean => error.code === 'network' || error.code === 'timeout' || error.code === 'server' || error.code === 'unknown';

type PersistedRecurringCalls = Pick<RecurringCallsData, 'schedules' | 'options' | 'fetchedAt'>;

let runner: SliceRunner<RecurringSlice, RecurringCallsState>;

/** The form options were read this session (persisted ones may be from an earlier one). */
let optionsLoaded = false;

/** One write per busy key: pressing again, or a second write on the same schedule or occurrence, joins the one in flight. */
const writes = createKeyedFlight();

/** Schedules deleted this session: a list read that left before the delete must not bring them back. */
const deletedIds = new Set<number>();

export const useRecurringCallsStore = create<RecurringCallsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<RecurringSlice, RecurringCallsState>('recurring-calls', set);

      /** The lists a write can change, read again. Writes that page people also change the pending and scheduled queues. */
      const refreshAfterWrite = (recurringCallId: number | null, callsChanged: boolean): void => {
        void get().fetchRecurringCalls({ bypassCache: true });

        if (recurringCallId !== null && get().details[String(recurringCallId)]) void get().fetchRecurringCall(recurringCallId, { bypassCache: true });
        const window = get().calendarRequest ?? get().calendarWindow;

        if (window) void get().fetchCalendar(window, { bypassCache: true });
        void useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true });

        if (callsChanged) {
          const calls = useCallsStore.getState();
          void calls.refreshQueuedCallLists();
          void calls.fetchCalls({ bypassCache: true });
        }
      };

      /**
       * Runs a write under its busy key. `isCurrent` turns false once the session it started in has ended (sign-out, reset):
       * a write that lands after that clears no busy state and starts no refresh in the next session.
       */
      const runWrite = <T>(key: string, write: (isCurrent: () => boolean) => Promise<T>): Promise<T> =>
        writes.run(key, async () => {
          const generation = runner.generation();
          const isCurrent = (): boolean => generation === runner.generation();
          set((state) => ({ busyKeys: [...state.busyKeys.filter((entry) => entry !== key), key] }));

          try {
            return await write(isCurrent);
          } finally {
            // Only this write's key: another write still running keeps its spinner.
            if (isCurrent()) set((state) => ({ busyKeys: state.busyKeys.filter((entry) => entry !== key) }));
          }
        });

      const runScheduleWrite = (
        recurringCallId: number,
        operation: ScheduleOperation,
        write: () => Promise<RecurringCallActionResult>,
        callsChanged: boolean,
        onSuccess?: () => void
      ): Promise<RecurringCallActionOutcome> =>
        runWrite(recurringScheduleKey(recurringCallId), async (isCurrent) => {
          let outcome: RecurringCallActionOutcome;

          try {
            const result = assertV4Success(await write());
            outcome = { ok: result?.Success === true, message: result?.Message ?? null, schedule: result?.Data ?? null, error: null };
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'A recurring call schedule write failed', context: { operation, recurringCallId, code: dataError.code, status: dataError.status } });
            outcome = { ok: false, message: null, schedule: null, error: dataError };
          }

          if (isCurrent()) {
            if (outcome.ok) onSuccess?.();
            refreshAfterWrite(recurringCallId, callsChanged);
          }

          return outcome;
        });

      return {
        ...initialData(),

        fetchRecurringCalls: async (options) => {
          // A failed refresh keeps the last list on screen.
          await runner.run(
            'list',
            async () => unwrapList(await getRecurringCalls(getDataApiContext())),
            (schedules) => ({ schedules: deletedIds.size > 0 ? schedules.filter((schedule) => !deletedIds.has(schedule.RecurringCallId)) : schedules }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchRecurringCall: async (recurringCallId, options) => {
          const key = String(recurringCallId);

          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getRecurringCall(getDataApiContext(), { recurringCallId })),
            // A read that left before the schedule was deleted here answers as if it were gone: it never restores the copy.
            (detail, state) =>
              detail && !deletedIds.has(recurringCallId)
                ? { details: { ...state.details, [key]: detail }, detailErrors: withoutKey(state.detailErrors, key) }
                : { details: withoutKey(state.details, key), detailErrors: { ...state.detailErrors, [key]: NOT_FOUND } },
            { flightKey: `detail:${key}`, raceKey: `detail:${key}`, trailing: options?.bypassCache === true }
          );

          if (deletedIds.has(recurringCallId)) return null;

          if (result.ok) return result.value;
          const failure = result.error;

          if (failure && !result.stale) {
            // A schedule deleted elsewhere answers 404: it is gone, not unreadable, so its last copy goes too.
            set((state) => ({ detailErrors: { ...state.detailErrors, [key]: failure }, details: failure.code === 'not_found' ? withoutKey(state.details, key) : state.details }));
          }

          return get().details[key] ?? null;
        },

        fetchOptions: async (force = false) => {
          const current = get().options;

          // Persisted options show offline; rights and run cards are read again once per session.
          if (current && optionsLoaded && !force) return current;

          const result = await runner.run(
            'options',
            async () => unwrapItem(await getRecurringCallOptions(getDataApiContext())),
            (options, state) => ({ options: options ?? state.options }),
            { silent: current !== null }
          );

          // An empty answer (not_found, no data) keeps the stored options for offline use but asks again next time.
          if (result.ok && result.value) optionsLoaded = true;

          return get().options;
        },

        fetchCalendar: async (window, options) => {
          // Coming back to a window whose earlier read is still out starts a read of its own: the window asked for in
          // between took the lane, so that earlier answer is dropped as stale.
          const changed = !sameWindow(get().calendarRequest, window);
          set({ calendarRequest: window });
          await runner.run(
            'calendar',
            async () => unwrapList(await getScheduledCallsCalendar(getDataApiContext(), { start: window.start, end: window.end })),
            // Only the window asked for last is shown, and its entries arrive with it: a window never shows another's entries.
            (calendar, state) => (sameWindow(state.calendarRequest, window) ? { calendar, calendarWindow: window } : {}),
            { flightKey: `calendar:${window.start}|${window.end}`, raceKey: 'calendar', trailing: options?.bypassCache === true || changed }
          );
        },

        saveRecurringCall: (input) =>
          runWrite(recurringScheduleKey(input.RecurringCallId), async (isCurrent) => {
            try {
              const saved = unwrapItem(assertV4Success(await saveRecurringCall(getDataApiContext(), input)));

              if (isCurrent()) refreshAfterWrite(saved?.RecurringCallId ?? null, (saved?.CreatedCalls ?? 0) > 0 || (saved?.ReplacedCalls ?? 0) > 0);

              return saved;
            } catch (error) {
              const dataError = toDataError(error);
              getDataLogger().warn({ message: 'Saving a recurring call failed', context: { operation: 'save', recurringCallId: input.RecurringCallId, code: dataError.code, status: dataError.status } });

              // It may have been saved: show the lists as the server has them before the dispatcher tries again.
              if (isCurrent() && mayHaveCommitted(dataError)) refreshAfterWrite(input.RecurringCallId > 0 ? input.RecurringCallId : null, true);

              throw error;
            }
          }),

        pauseRecurringCall: (input) => runScheduleWrite(input.RecurringCallId, 'pause', () => pauseRecurringCall(getDataApiContext(), input), input.DeleteUpcomingCalls),

        resumeRecurringCall: (recurringCallId) => runScheduleWrite(recurringCallId, 'resume', () => resumeRecurringCall(getDataApiContext(), { RecurringCallId: recurringCallId }), true),

        deleteRecurringCall: (recurringCallId, deleteUpcomingCalls) =>
          runScheduleWrite(
            recurringCallId,
            'delete',
            () => deleteRecurringCall(getDataApiContext(), { RecurringCallId: recurringCallId, DeleteUpcomingCalls: deleteUpcomingCalls }),
            deleteUpcomingCalls,
            () => {
              deletedIds.add(recurringCallId);
              const key = String(recurringCallId);
              set((state) => ({
                schedules: state.schedules.filter((schedule) => schedule.RecurringCallId !== recurringCallId),
                details: withoutKey(state.details, key),
                detailErrors: { ...state.detailErrors, [key]: NOT_FOUND },
              }));
            }
          ),

        runOccurrenceAction: (action, occurrence) =>
          runWrite(recurringOccurrenceKey(occurrence), async (isCurrent) => {
            let outcome: RecurringOccurrenceOutcome;

            try {
              const result = assertV4Success(await OCCURRENCE_ACTIONS[action](occurrence));
              const data = result?.Data ?? null;
              outcome = { ok: result?.Success === true, outcome: data?.Outcome ?? null, callId: data?.CallId ?? null, callNumber: data?.CallNumber ?? null, callState: data?.CallState ?? null, error: null };
            } catch (error) {
              const dataError = toDataError(error);
              getDataLogger().warn({ message: 'A recurring call occurrence action failed', context: { operation: action, recurringCallId: occurrence.RecurringCallId, code: dataError.code, status: dataError.status } });
              outcome = failedOccurrence(dataError);
            }

            if (isCurrent()) refreshAfterWrite(occurrence.RecurringCallId, action === 'dispatch' || action === 'create');

            return outcome;
          }),
      };
    },
    dataPersistOptions<RecurringCallsState, PersistedRecurringCalls>({
      name: 'omni-recurring-calls-storage',
      partialize: (state) => ({ schedules: state.schedules, options: state.options, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-recurring-calls-storage', useRecurringCallsStore);

registerDataStoreReset<RecurringCallsState>('recurring-calls', useRecurringCallsStore, initialData, () => {
  runner.invalidate();
  writes.clear();
  deletedIds.clear();
  optionsLoaded = false;
});
