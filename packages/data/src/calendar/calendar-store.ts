import { getCalendarItem, getDepartmentCalendarItems, getDepartmentCalendarItemsInRange, getDepartmentCalendarItemTypes, setCalendarAttendingStatus } from '@resgrid/api';
import type { CalendarItemResultData, GetAllCalendarItemTypesResult } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, type Enveloped, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/** Core attendance types for `SetCalendarAttendingStatus` (Responder): 1 attending, 4 not attending. */
export const CalendarAttendingType = { Attending: 1, NotAttending: 4 } as const;

type CalendarSlice = 'items' | 'range' | 'detail' | 'types' | 'today' | 'upcoming';

interface CalendarData extends SliceMeta<CalendarSlice> {
  calendarItems: CalendarItemResultData[];
  /** Items for the last requested range (month view). */
  rangeItems: CalendarItemResultData[];
  rangeKey: string | null;
  todayItems: CalendarItemResultData[];
  upcomingItems: CalendarItemResultData[];
  itemDetailsById: Record<string, CalendarItemResultData>;
  itemTypes: GetAllCalendarItemTypesResult[];
  attendanceError: DataError | null;
}

export interface CalendarState extends CalendarData {
  fetchCalendarItems: (options?: FetchOptions) => Promise<void>;
  fetchItemsForDateRange: (start: string, end: string, options?: FetchOptions) => Promise<void>;
  /** Today (department-local day boundaries are computed by the caller and passed as an ISO range). */
  fetchTodaysItems: (start: string, end: string, options?: FetchOptions) => Promise<void>;
  fetchUpcomingItems: (start: string, end: string, options?: FetchOptions) => Promise<void>;
  fetchCalendarItem: (calendarItemId: string, options?: FetchOptions) => Promise<CalendarItemResultData | null>;
  fetchItemTypes: (options?: FetchOptions) => Promise<void>;
  /** Online only. */
  setAttendance: (calendarItemId: string, attending: boolean, note?: string) => Promise<boolean>;
}

const initialData = (): CalendarData => ({
  ...emptySliceMeta<CalendarSlice>(),
  calendarItems: [],
  rangeItems: [],
  rangeKey: null,
  todayItems: [],
  upcomingItems: [],
  itemDetailsById: {},
  itemTypes: [],
  attendanceError: null,
});

const inRange = async (start: string, end: string): Promise<CalendarItemResultData[]> => unwrapList(await getDepartmentCalendarItemsInRange(getDataApiContext(), { start, end }));

let runner: SliceRunner<CalendarSlice, CalendarState>;

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<CalendarSlice, CalendarState>('calendar', set);
      return {
        ...initialData(),
        fetchCalendarItems: async () => {
          await runner.run(
            'items',
            async () => unwrapList(await getDepartmentCalendarItems(getDataApiContext())),
            (calendarItems) => ({ calendarItems })
          );
        },
        fetchItemsForDateRange: async (start, end) => {
          const rangeKey = `${start}|${end}`;
          await runner.run(
            'range',
            () => inRange(start, end),
            (rangeItems) => ({ rangeItems, rangeKey }),
            { flightKey: `range:${rangeKey}` }
          );
        },
        fetchTodaysItems: async (start, end) => {
          await runner.run(
            'today',
            () => inRange(start, end),
            (todayItems) => ({ todayItems })
          );
        },
        fetchUpcomingItems: async (start, end) => {
          await runner.run(
            'upcoming',
            () => inRange(start, end),
            (upcomingItems) => ({ upcomingItems })
          );
        },
        fetchCalendarItem: async (calendarItemId, options) => {
          const cached = get().itemDetailsById[calendarItemId];
          if (cached && !options?.bypassCache) return cached;
          // Core's action takes `id` (the legacy apps sent calendarItemId/itemId — survey finding 2).
          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getCalendarItem(getDataApiContext(), { id: calendarItemId })),
            (item, state) => (item ? { itemDetailsById: { ...state.itemDetailsById, [calendarItemId]: item } } : {}),
            { flightKey: `detail:${calendarItemId}` }
          );
          return result.ok ? result.value : (cached ?? null);
        },
        fetchItemTypes: async () => {
          await runner.run(
            'types',
            // The API types this action with the item shape; Core answers with an envelope of item types.
            async () => unwrapList((await getDepartmentCalendarItemTypes(getDataApiContext())) as unknown as Enveloped<GetAllCalendarItemTypesResult[]>),
            (itemTypes) => ({ itemTypes })
          );
        },
        setAttendance: async (calendarItemId, attending, note) => {
          set({ attendanceError: null });
          try {
            assertV4Success(
              await setCalendarAttendingStatus(getDataApiContext(), { CalendarEventId: calendarItemId, Type: attending ? CalendarAttendingType.Attending : CalendarAttendingType.NotAttending, Note: note ?? '' })
            );
            await get().fetchCalendarItem(calendarItemId, { bypassCache: true });
            return true;
          } catch (error) {
            set({ attendanceError: toDataError(error) });
            return false;
          }
        },
      };
    },
    dataPersistOptions<CalendarState, Pick<CalendarData, 'calendarItems' | 'todayItems' | 'upcomingItems' | 'itemDetailsById' | 'itemTypes' | 'fetchedAt'>>({
      name: 'omni-calendar-storage',
      partialize: (state) => ({
        calendarItems: state.calendarItems,
        todayItems: state.todayItems,
        upcomingItems: state.upcomingItems,
        itemDetailsById: state.itemDetailsById,
        itemTypes: state.itemTypes,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-calendar-storage', useCalendarStore);
registerDataStoreReset<CalendarState>('calendar', useCalendarStore, initialData, () => runner.invalidate());
