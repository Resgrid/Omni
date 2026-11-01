import type { CalendarItemResult, CalendarItemsResult, GetAllCalendarItemTypesResult, SetCalendarAttendingResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for calendar (Calendar). The contract test checks every entry against Swagger. */
export const calendarEndpoints = defineEndpoints('calendar', {
  getCalendarItem: { method: 'GET', path: '/Calendar/GetCalendarItem', query: ['id'] },
  getDepartmentCalendarItems: { method: 'GET', path: '/Calendar/GetDepartmentCalendarItems' },
  getDepartmentCalendarItemsInRange: { method: 'GET', path: '/Calendar/GetDepartmentCalendarItemsInRange', query: ['start', 'end', 'includeChecklists'] },
  getDepartmentCalendarItemTypes: { method: 'GET', path: '/Calendar/GetDepartmentCalendarItemTypes' },
  setCalendarAttendingStatus: { method: 'POST', path: '/Calendar/SetCalendarAttendingStatus', body: 'json' },
});

const E = calendarEndpoints;

/** Gets the calendar item. `GET /Calendar/GetCalendarItem` — legacy: BDR. */
export const getCalendarItem = (ctx: ApiContext, params: { id: number | string }, options?: RequestOptions): Promise<CalendarItemResult> => request<CalendarItemResult>(ctx, E.getCalendarItem, { params }, options);

/** Gets the department calendar items. `GET /Calendar/GetDepartmentCalendarItems` — legacy: BDR. */
export const getDepartmentCalendarItems = (ctx: ApiContext, options?: RequestOptions): Promise<CalendarItemsResult> => request<CalendarItemsResult>(ctx, E.getDepartmentCalendarItems, {}, options);

/** Gets the department calendar items in range. `GET /Calendar/GetDepartmentCalendarItemsInRange` — legacy: BDR. */
export const getDepartmentCalendarItemsInRange = (ctx: ApiContext, params: { start?: string; end?: string; includeChecklists?: boolean } = {}, options?: RequestOptions): Promise<CalendarItemsResult> =>
  request<CalendarItemsResult>(ctx, E.getDepartmentCalendarItemsInRange, { params }, options);

/** Gets the department calendar item types. `GET /Calendar/GetDepartmentCalendarItemTypes` — legacy: BDR. */
export const getDepartmentCalendarItemTypes = (ctx: ApiContext, options?: RequestOptions): Promise<GetAllCalendarItemTypesResult> =>
  request<GetAllCalendarItemTypesResult>(ctx, E.getDepartmentCalendarItemTypes, {}, options);

/** `POST /Calendar/SetCalendarAttendingStatus` — legacy: BDR. */
export const setCalendarAttendingStatus = (ctx: ApiContext, body: Record<string, unknown>, options?: RequestOptions): Promise<SetCalendarAttendingResult> =>
  request<SetCalendarAttendingResult>(ctx, E.setCalendarAttendingStatus, { body }, options);
