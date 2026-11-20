import type { RouteDirectionWaypointData, RouteInstanceResultData } from '@resgrid/models';

import type { RouteMapStop } from '../map-slot';
import { isMappable } from './route-geo';

/**
 * Runs started for a call (Core M0322, `Routes/StartCallRoute`): the instance names its call (`CallId`) and, while the run
 * has not reached its start (a station or start point before the first stop), live directions asked with `includeStart`
 * lead there first (a waypoint and leg with `IsRouteStart`, no stop ids).
 */

/** The call a run was started for, as the calls store keys it; null for any other run (and from older servers). */
export const runCallId = (instance: Pick<RouteInstanceResultData, 'CallId'> | null | undefined): string | null => {
  const id = instance?.CallId ?? null;

  return id !== null && Number.isSafeInteger(id) && id > 0 ? String(id) : null;
};

/** A call's run that has not reached its start yet: its live directions are asked with `includeStart` (the server decides). */
export const isRouteStartPending = (instance: Pick<RouteInstanceResultData, 'CallId' | 'StartReachedOn'> | null | undefined): boolean => runCallId(instance) !== null && !instance?.StartReachedOn;

/** The leading "route start" waypoint of live directions, or null when there is none (start reached, or not a call's run). */
export const routeStartWaypoint = (waypoints: readonly RouteDirectionWaypointData[] | null | undefined): RouteDirectionWaypointData | null => waypoints?.find((waypoint) => waypoint.IsRouteStart === true) ?? null;

/** The route start as its own labelled map marker (drawn before the first stop), or null when it has no position. */
export const routeStartMapStop = (waypoint: RouteDirectionWaypointData | null, label: string, color: string): RouteMapStop | null =>
  waypoint && isMappable(waypoint.Latitude, waypoint.Longitude)
    ? { id: 'route-start', order: 0, name: waypoint.Name ?? '', latitude: waypoint.Latitude, longitude: waypoint.Longitude, status: 0, isCurrent: true, color, label }
    : null;
