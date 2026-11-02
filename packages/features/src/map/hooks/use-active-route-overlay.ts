import { RouteInstanceStatus, RouteStopStatus, useRoutesStore } from '@resgrid/data';
import { type LngLat, parseRouteGeometry, type RouteGeometry } from '@resgrid/features/unit-routes/lib/route-geo';
import { instanceMapStops, routeColor, stopGeofence } from '@resgrid/features/unit-routes/lib/route-map';
import { currentStop, sortStops } from '@resgrid/features/unit-routes/lib/route-status';
import type { RouteMapStop } from '@resgrid/features/unit-routes/map-slot';
import { useEffect, useMemo } from 'react';

/** What the main map draws for the unit's running route (legacy Unit map's route overlay). */
export interface ActiveRouteOverlayData {
  routeInstanceId: string;
  /** Server route geometry: live instance directions when the routes screens fetched them, else the plan's stored route. */
  line: RouteGeometry | null;
  /** Remaining stops (pending or checked in), numbered by stop order and coloured by status. */
  stops: RouteMapStop[];
  /** Check-in radius around the stop the crew works next. */
  geofence: LngLat[] | null;
  color: string;
}

const isRunning = (status: number | null | undefined): boolean => status === RouteInstanceStatus.InProgress || status === RouteInstanceStatus.Paused;
const isRemaining = (status: number): boolean => status === RouteStopStatus.Pending || status === RouteStopStatus.CheckedIn;

/**
 * The device unit's active route for the main map (porting gap: Unit active-route overlay). Reads the persisted routes
 * store (so it shows offline) and refreshes the active instance for the unit and its stops on mount. Never calls a
 * routing provider: the line is what Core already returned. The plan is fetched only when no plan detail is loaded at
 * all — another plan open on a routes screen is left alone. Null when disabled, without a unit, or with no running route.
 */
export function useActiveRouteOverlay(enabled: boolean, unitId: string | null): ActiveRouteOverlayData | null {
  const activeInstance = useRoutesStore((state) => state.activeInstance);
  const stopDetails = useRoutesStore((state) => state.stopDetails);
  const directions = useRoutesStore((state) => state.directions);
  const activePlan = useRoutesStore((state) => state.activePlan);
  const routePlans = useRoutesStore((state) => state.routePlans);

  const active = enabled && unitId !== null && unitId !== '';
  const instance = active && activeInstance && isRunning(activeInstance.Status) && String(activeInstance.UnitId) === unitId ? activeInstance : null;
  const instanceId = instance?.RouteInstanceId ?? null;
  const planId = instance?.RoutePlanId ?? null;
  const hasPlanDetail = activePlan !== null;
  const hasDirections = instanceId !== null && directions?.RouteInstanceId === instanceId;

  useEffect(() => {
    if (!active || !unitId) return;
    void useRoutesStore.getState().fetchActiveRoute(unitId);
  }, [active, unitId]);

  useEffect(() => {
    if (!instanceId) return;
    void useRoutesStore.getState().fetchStopsForInstance(instanceId);
  }, [instanceId]);

  useEffect(() => {
    if (!planId || hasDirections || hasPlanDetail) return;
    void useRoutesStore.getState().fetchRoutePlan(planId);
  }, [hasDirections, hasPlanDetail, planId]);

  return useMemo(() => {
    if (!instance || !instanceId) return null;
    const stops = sortStops(stopDetails.filter((stop) => !stop.RouteInstanceId || stop.RouteInstanceId === instanceId));
    const current = currentStop(stops);
    const currentId = current ? (current.RouteInstanceStopId ?? current.RouteStopId) : null;
    const planDetail = activePlan && activePlan.RoutePlanId === instance.RoutePlanId ? activePlan : null;
    const plan = routePlans.find((candidate) => candidate.RoutePlanId === instance.RoutePlanId) ?? null;
    const liveGeometry = directions && directions.RouteInstanceId === instanceId ? directions.Geometry : null;
    return {
      routeInstanceId: instanceId,
      line: parseRouteGeometry(liveGeometry) ?? parseRouteGeometry(planDetail?.MapboxRouteGeometry),
      stops: instanceMapStops(stops, currentId).filter((stop) => isRemaining(stop.status)),
      geofence: stopGeofence(current, planDetail?.GeofenceRadiusMeters),
      color: routeColor(plan?.RouteColor ?? planDetail?.RouteColor),
    };
  }, [activePlan, directions, instance, instanceId, routePlans, stopDetails]);
}
