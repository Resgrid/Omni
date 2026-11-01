import { type ApiContext, defineEndpoints, request } from '@resgrid/api';
import type { ArchivedCallsResult, CallResultData, CallYearsResult } from '@resgrid/models';
import { create } from 'zustand';

import { unwrapList } from '../core/envelope';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type SliceMeta, type SliceRunner } from '../core/slices';

/**
 * Archived calls (Dispatch baseline `stores/calls/archived-store`): the department's closed calls (States 1-7), one
 * year at a time, newest first.
 *
 * TODO(omni): `/Calls/GetCallYears` and `/Calls/GetArchivedCalls` exist only on Core's `archived-calls` branch, not on
 * `develop` (owner decision 15: Omni relies on develop), so they are not in @resgrid/api's registry and its contract
 * test. They are declared here until Core merges them; then move both to `@resgrid/api` `endpoints/calls` and import
 * them from there. On a server without them the screen shows the load error, nothing else breaks.
 */
export const archivedCallsEndpoints = defineEndpoints('archived-calls', {
  getCallYears: { method: 'GET', path: '/Calls/GetCallYears' },
  getArchivedCalls: { method: 'GET', path: '/Calls/GetArchivedCalls', query: ['year'] },
});

const getCallYears = (ctx: ApiContext): Promise<CallYearsResult> => request<CallYearsResult>(ctx, archivedCallsEndpoints.getCallYears);

const getArchivedCalls = (ctx: ApiContext, year: string): Promise<ArchivedCallsResult> => request<ArchivedCallsResult>(ctx, archivedCallsEndpoints.getArchivedCalls, { params: { year } });

type ArchivedSlice = 'years' | 'calls';

interface ArchivedCallsData extends SliceMeta<ArchivedSlice> {
  /** Years the department has calls in, newest first; the selected year is always among them. */
  years: string[];
  /** The year whose archived calls are loaded; null until the years have loaded. */
  selectedYear: string | null;
  /** Closed calls logged in the selected year, newest first. */
  archivedCalls: CallResultData[];
}

export interface ArchivedCallsState extends ArchivedCallsData {
  /** Loads the years, then `preferredYear`'s calls, else the selected year's, else the newest year (the current year when none). */
  load: (preferredYear?: string) => Promise<void>;
  selectYear: (year: string) => Promise<void>;
  fetchArchivedCalls: () => Promise<void>;
}

const initialData = (): ArchivedCallsData => ({ ...emptySliceMeta<ArchivedSlice>(), years: [], selectedYear: null, archivedCalls: [] });

/** The year list with `year` in its place (newest first), for a year the server has not reported calls in yet. */
export const withArchivedYear = (years: readonly string[], year: string): string[] => (years.includes(year) ? [...years] : [...years, year].sort((a, b) => Number(b) - Number(a)));

let runner: SliceRunner<ArchivedSlice, ArchivedCallsState>;

export const useArchivedCallsStore = create<ArchivedCallsState>()((set, get) => {
  runner = createSliceRunner<ArchivedSlice, ArchivedCallsState>('archived-calls', set);

  return {
    ...initialData(),

    load: async (preferredYear) => {
      const result = await runner.run(
        'years',
        async () => unwrapList(await getCallYears(getDataApiContext())).map(String),
        (years, state) => {
          const current = state.selectedYear;
          const year = preferredYear || (current && years.includes(current) ? current : years[0]) || String(new Date(dataNow()).getFullYear());
          return { years: withArchivedYear(years, year), selectedYear: year };
        }
      );
      if (result.ok) await get().fetchArchivedCalls();
    },

    selectYear: async (year) => {
      if (year === get().selectedYear && (get().fetchedAt.calls ?? 0) > 0) return;
      // The previous year's rows would read as this year's while the new ones load.
      set((state) => ({ selectedYear: year, years: withArchivedYear(state.years, year), archivedCalls: [] }));
      await get().fetchArchivedCalls();
    },

    fetchArchivedCalls: async () => {
      const year = get().selectedYear;
      if (!year) return;
      // The slice runner's race guard keeps only the newest year's answer when years are switched quickly.
      await runner.run(
        'calls',
        async () => unwrapList(await getArchivedCalls(getDataApiContext(), year)),
        (archivedCalls, state) => (state.selectedYear === year ? { archivedCalls } : {})
      );
    },
  };
});

registerDataStoreReset<ArchivedCallsState>('archived-calls', useArchivedCallsStore, initialData, () => runner.invalidate());
