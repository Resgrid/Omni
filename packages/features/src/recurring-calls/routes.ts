import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Recurring calls (Dispatch, `capabilities.calls.recurringCalls`): the schedules, one schedule, its form, the occurrence
 * calendar and the dispatcher alerts. Calls they link to use `@resgrid/features/calls` routes. Schedule ids are numbers.
 */
export const RECURRING_CALLS_ROUTE_PATTERNS = {
  list: '/recurring-calls',
  new: '/recurring-calls/new',
  calendar: '/recurring-calls/calendar',
  detail: '/recurring-calls/[id]',
  edit: '/recurring-calls/[id]/edit',
  alerts: '/recurring-call-alerts',
} as const;

const isScheduleId = (id: string | number | null | undefined): boolean => /^[1-9]\d*$/.test(String(id ?? ''));

export const recurringCallsRoutes = {
  list: (): string => '/recurring-calls',
  new: (): string => '/recurring-calls/new',
  /** The calendar, narrowed to one schedule when its id is given. */
  calendar: (recurringCallId?: number | null): string => (recurringCallId && isScheduleId(recurringCallId) ? `/recurring-calls/calendar?recurringCallId=${recurringCallId}` : '/recurring-calls/calendar'),
  detail: (id: string | number): string | null => routePathWithId('recurringCalls.detail', id, (scheduleId) => `/recurring-calls/${scheduleId}`, isScheduleId),
  edit: (id: string | number): string | null => routePathWithId('recurringCalls.edit', id, (scheduleId) => `/recurring-calls/${scheduleId}/edit`, isScheduleId),
  alerts: (): string => '/recurring-call-alerts',
} as const;
