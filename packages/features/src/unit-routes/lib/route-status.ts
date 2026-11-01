import { RouteInstanceStatus, RouteStopStatus } from '@resgrid/data';
import type { RouteDeviationResultData, RouteInstanceResultData, RouteStopWithDetailsResultData } from '@resgrid/models';

export interface StatusLook {
  labelKey: string;
  color: string;
}

/** Core instance-stop status: 0 pending, 1 checked in, 2 checked out (done), 3 skipped. */
export const STOP_STATUS_LOOK: Readonly<Record<number, StatusLook>> = {
  [RouteStopStatus.Pending]: { labelKey: 'routes.pending', color: '#9ca3af' },
  [RouteStopStatus.CheckedIn]: { labelKey: 'routes.in_progress', color: '#3b82f6' },
  [RouteStopStatus.CheckedOut]: { labelKey: 'routes.completed', color: '#22c55e' },
  [RouteStopStatus.Skipped]: { labelKey: 'routes.skipped', color: '#eab308' },
};

export const stopStatusLook = (status: number | null | undefined): StatusLook => STOP_STATUS_LOOK[status ?? RouteStopStatus.Pending] ?? STOP_STATUS_LOOK[RouteStopStatus.Pending];

/** Core `RouteInstanceStatus`. */
export const INSTANCE_STATUS_LOOK: Readonly<Record<number, StatusLook>> = {
  [RouteInstanceStatus.Scheduled]: { labelKey: 'unit_routes.instance_status.scheduled', color: '#9ca3af' },
  [RouteInstanceStatus.InProgress]: { labelKey: 'routes.active', color: '#3b82f6' },
  [RouteInstanceStatus.Completed]: { labelKey: 'routes.completed', color: '#22c55e' },
  [RouteInstanceStatus.Cancelled]: { labelKey: 'unit_routes.instance_status.cancelled', color: '#ef4444' },
  [RouteInstanceStatus.Abandoned]: { labelKey: 'unit_routes.instance_status.abandoned', color: '#f97316' },
  [RouteInstanceStatus.Paused]: { labelKey: 'routes.paused', color: '#eab308' },
};

export const instanceStatusLook = (status: number | null | undefined): StatusLook => INSTANCE_STATUS_LOOK[status ?? RouteInstanceStatus.Scheduled] ?? INSTANCE_STATUS_LOOK[RouteInstanceStatus.Scheduled];

/** Core `RouteStopType` (Unit showed pickup/dropoff labels that Core never had). */
export const STOP_TYPE_KEYS: Readonly<Record<number, string>> = {
  0: 'unit_routes.stop_type.manual',
  1: 'unit_routes.stop_type.scheduled_call',
  2: 'unit_routes.stop_type.station',
  3: 'unit_routes.stop_type.waypoint',
};

/** Core `RouteStopPriority`: Normal 0, High 1, Critical 2, Optional 3 (Unit mislabelled 1 as Low and 2 as Medium). */
export const STOP_PRIORITY_LOOK: Readonly<Record<number, StatusLook>> = {
  0: { labelKey: 'routes.priority_normal', color: '#6b7280' },
  1: { labelKey: 'routes.priority_high', color: '#f97316' },
  2: { labelKey: 'routes.priority_critical', color: '#dc2626' },
  3: { labelKey: 'unit_routes.priority_optional', color: '#0ea5e9' },
};

const DEVIATION_TYPE_KEYS: readonly string[] = ['routes.deviation_type_off_route', 'routes.deviation_type_missed_stop', 'routes.deviation_type_unexpected_stop', 'routes.deviation_type_speed_violation'];

export const deviationTypeKey = (type: number | null | undefined): string => (typeof type === 'number' ? DEVIATION_TYPE_KEYS[type] : undefined) ?? 'routes.deviation_type_other';

/** Done for progress: checked out or skipped. */
export const isStopDone = (status: number | null | undefined): boolean => status === RouteStopStatus.CheckedOut || status === RouteStopStatus.Skipped;

/** Stops in route order. */
export const sortStops = <T extends { StopOrder: number }>(stops: readonly T[]): T[] => [...stops].sort((a, b) => a.StopOrder - b.StopOrder);

/** The stop the crew works next: the first checked-in stop, else the first pending one (route order). */
export function currentStop<T extends { StopOrder: number; Status: number }>(stops: readonly T[]): T | null {
  const ordered = sortStops(stops);
  return ordered.find((stop) => stop.Status === RouteStopStatus.CheckedIn) ?? ordered.find((stop) => stop.Status === RouteStopStatus.Pending) ?? null;
}

/** Percent complete from the stops (checked out + skipped), else from the instance counters. */
export function progressPercent(stops: readonly { Status: number }[], instance?: Pick<RouteInstanceResultData, 'StopsCompleted' | 'StopsTotal'> | null): number {
  if (stops.length > 0) return Math.round((stops.filter((stop) => isStopDone(stop.Status)).length / stops.length) * 100);
  const total = instance?.StopsTotal ?? 0;
  return total > 0 ? Math.round(((instance?.StopsCompleted ?? 0) / total) * 100) : 0;
}

/** Unacknowledged deviations of this instance, newest first (the endpoint answers for the whole department). */
export const instanceDeviations = (deviations: readonly RouteDeviationResultData[], instanceId: string | null | undefined): RouteDeviationResultData[] =>
  instanceId ? deviations.filter((deviation) => deviation.RouteInstanceId === instanceId && !deviation.IsAcknowledged).sort((a, b) => String(b.DetectedOn).localeCompare(String(a.DetectedOn))) : [];

/** Whether this unit may start the plan: it has an active unit and the plan is unassigned or assigned to it (ids compared as strings). */
export const canStartPlan = (planUnitId: number | null | undefined, activeUnitId: string | null | undefined): boolean =>
  !!activeUnitId && (planUnitId === null || planUnitId === undefined || planUnitId === 0 || String(planUnitId) === String(activeUnitId));

export type StopActionKind = 'checkIn' | 'checkOut' | 'skip';

/** The actions a stop offers: check in while pending, check out while checked in, skip until it is done. */
export function stopActions(stop: Pick<RouteStopWithDetailsResultData, 'Status'>): StopActionKind[] {
  if (stop.Status === RouteStopStatus.Pending) return ['checkIn', 'skip'];
  if (stop.Status === RouteStopStatus.CheckedIn) return ['checkOut', 'skip'];
  return [];
}
