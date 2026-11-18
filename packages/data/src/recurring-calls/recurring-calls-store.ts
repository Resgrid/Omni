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

interface RecurringCallsData extends SliceMeta<RecurringSlice> {
  /** Every schedule of the department, paused and ended ones included, in the server's order. */
  schedules: RecurringCallResultData[];
  /** Loaded schedule details by id. */
  details: Record<string, RecurringCallDetailResultData>;
  /** Why a schedule's detail could not be read, by id (`not_found` once it was deleted). */
  detailErrors: Record<string, DataError>;
  options: RecurringCallOptionsResultData | null;
  /** The window the calendar entries belong to. */
  calendarWindow: RecurringCallsCalendarWindow | null;
  calendar: ScheduledCallCalendarEntryData[];
  /** The write in flight (`schedule:<id>` or `occurrence:<id>@<instant>`), so its button can spin. */
  busyKey: string | null;
}

export interface RecurringCallsState extends RecurringCallsData {
  fetchRecurringCalls: (options?: FetchOptions) => Promise<void>;
  fetchRecurringCall: (recurringCallId: number, options?: FetchOptions) => Promise<RecurringCallDetailResultData | null>;
  /** Loads the form options once per session; `force` reads them again. */
  fetchOptions: (force?: boolean) => Promise<RecurringCallOptionsResultData | null>;
  fetchCalendar: (window: RecurringCallsCalendarWindow, options?: FetchOptions) => Promise<void>;
  /**
   * Creates or updates a schedule. Throws what the request threw: a 400 carries the server's validation keys in its body
   * (`Errors`), which the form reads and words itself.
   */
  saveRecurringCall: (input: RecurringCallInput) => Promise<SaveRecurringCallResultData | null>;
  pauseRecurringCall: (input: PauseRecurringCallInput) => Promise<RecurringCallActionOutcome>;
  resumeRecurringCall: (recurringCallId: number) => Promise<RecurringCallActionOutcome>;
  deleteRecurringCall: (recurringCallId: number, deleteUpcomingCalls: boolean) => Promise<RecurringCallActionOutcome>;
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
  calendar: [],
  busyKey: null,
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

type PersistedRecurringCalls = Pick<RecurringCallsData, 'schedules' | 'options' | 'fetchedAt'>;

let runner: SliceRunner<RecurringSlice, RecurringCallsState>;

/** The form options were read this session (persisted ones may be from an earlier one). */
let optionsLoaded = false;

export const useRecurringCallsStore = create<RecurringCallsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<RecurringSlice, RecurringCallsState>('recurring-calls', set);

      /** The lists a write can change, read again. Writes that page people also change the pending and scheduled queues. */
      const refreshAfterWrite = (recurringCallId: number | null, callsChanged: boolean): void => {
        void get().fetchRecurringCalls({ bypassCache: true });

        if (recurringCallId !== null && get().details[String(recurringCallId)]) void get().fetchRecurringCall(recurringCallId, { bypassCache: true });
        const window = get().calendarWindow;

        if (window) void get().fetchCalendar(window, { bypassCache: true });
        void useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true });

        if (callsChanged) {
          const calls = useCallsStore.getState();
          void calls.refreshQueuedCallLists();
          void calls.fetchCalls({ bypassCache: true });
        }
      };

      const runScheduleWrite = async (recurringCallId: number, label: string, write: () => Promise<RecurringCallActionResult>, callsChanged: boolean): Promise<RecurringCallActionOutcome> => {
        set({ busyKey: recurringScheduleKey(recurringCallId) });

        try {
          const result = assertV4Success(await write());

          return { ok: result?.Success === true, message: result?.Message ?? null, schedule: result?.Data ?? null, error: null };
        } catch (error) {
          const dataError = toDataError(error);
          getDataLogger().warn({ message: label, context: { code: dataError.code, status: dataError.status } });

          return { ok: false, message: null, schedule: null, error: dataError };
        } finally {
          set({ busyKey: null });
          refreshAfterWrite(recurringCallId, callsChanged);
        }
      };

      return {
        ...initialData(),

        fetchRecurringCalls: async (options) => {
          // A failed refresh keeps the last list on screen.
          await runner.run(
            'list',
            async () => unwrapList(await getRecurringCalls(getDataApiContext())),
            (schedules) => ({ schedules }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchRecurringCall: async (recurringCallId, options) => {
          const key = String(recurringCallId);

          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getRecurringCall(getDataApiContext(), { recurringCallId })),
            (detail, state) =>
              detail
                ? { details: { ...state.details, [key]: detail }, detailErrors: withoutKey(state.detailErrors, key) }
                : { details: withoutKey(state.details, key), detailErrors: { ...state.detailErrors, [key]: NOT_FOUND } },
            { flightKey: `detail:${key}`, raceKey: `detail:${key}`, trailing: options?.bypassCache === true }
          );

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

          if (result.ok) optionsLoaded = true;

          return get().options;
        },

        fetchCalendar: async (window, options) => {
          set({ calendarWindow: window });
          await runner.run(
            'calendar',
            async () => unwrapList(await getScheduledCallsCalendar(getDataApiContext(), { start: window.start, end: window.end })),
            // An answer for a window the screen has left is not shown (the newest request wins its lane too).
            (calendar, state) => (state.calendarWindow?.start === window.start && state.calendarWindow?.end === window.end ? { calendar } : {}),
            { flightKey: `calendar:${window.start}|${window.end}`, raceKey: 'calendar', trailing: options?.bypassCache === true }
          );
        },

        saveRecurringCall: async (input) => {
          set({ busyKey: recurringScheduleKey(input.RecurringCallId) });

          try {
            const saved = unwrapItem(assertV4Success(await saveRecurringCall(getDataApiContext(), input)));
            refreshAfterWrite(saved?.RecurringCallId ?? null, (saved?.CreatedCalls ?? 0) > 0 || (saved?.ReplacedCalls ?? 0) > 0);

            return saved;
          } finally {
            set({ busyKey: null });
          }
        },

        pauseRecurringCall: (input) => runScheduleWrite(input.RecurringCallId, 'Pausing a recurring call failed', () => pauseRecurringCall(getDataApiContext(), input), input.DeleteUpcomingCalls),

        resumeRecurringCall: (recurringCallId) => runScheduleWrite(recurringCallId, 'Resuming a recurring call failed', () => resumeRecurringCall(getDataApiContext(), { RecurringCallId: recurringCallId }), true),

        deleteRecurringCall: async (recurringCallId, deleteUpcomingCalls) => {
          const outcome = await runScheduleWrite(
            recurringCallId,
            'Deleting a recurring call failed',
            () => deleteRecurringCall(getDataApiContext(), { RecurringCallId: recurringCallId, DeleteUpcomingCalls: deleteUpcomingCalls }),
            deleteUpcomingCalls
          );

          if (outcome.ok) {
            const key = String(recurringCallId);
            set((state) => ({ schedules: state.schedules.filter((schedule) => schedule.RecurringCallId !== recurringCallId), details: withoutKey(state.details, key) }));
          }

          return outcome;
        },

        runOccurrenceAction: async (action, occurrence) => {
          set({ busyKey: recurringOccurrenceKey(occurrence) });

          try {
            const result = assertV4Success(await OCCURRENCE_ACTIONS[action](occurrence));
            const data = result?.Data ?? null;

            return { ok: result?.Success === true, outcome: data?.Outcome ?? null, callId: data?.CallId ?? null, callNumber: data?.CallNumber ?? null, callState: data?.CallState ?? null, error: null };
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'A recurring call occurrence action failed', context: { action, code: dataError.code, status: dataError.status } });

            return failedOccurrence(dataError);
          } finally {
            set({ busyKey: null });
            refreshAfterWrite(occurrence.RecurringCallId, action === 'dispatch' || action === 'create');
          }
        },
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
  optionsLoaded = false;
});
