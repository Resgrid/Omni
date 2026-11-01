import type { RouteDirectionWaypointData, RouteStopResultData, RouteStopWithDetailsResultData } from '@resgrid/models';

import type { RouteMapStop } from '../map-slot';
import { boundsOf, geofenceRing, geometryPositions, isMappable, type LngLat, type RouteBounds, type RouteGeometry } from './route-geo';
import { stopStatusLook } from './route-status';

/** The plan's colour, else Resgrid blue. */
export const DEFAULT_ROUTE_COLOR = '#3b82f6';
/** Geofence radius when neither the stop nor the plan sets one (Unit's default). */
export const DEFAULT_GEOFENCE_RADIUS_M = 100;

export const routeColor = (color: string | null | undefined): string => {
  const value = color?.trim() ?? '';
  if (value === '') return DEFAULT_ROUTE_COLOR;
  return /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? `#${value}` : value;
};

/** Map stops for the active route / a past instance (plan stop joined with progress). */
export const instanceMapStops = (stops: readonly RouteStopWithDetailsResultData[], currentId: string | null): RouteMapStop[] =>
  stops
    .filter((stop) => isMappable(stop.Latitude, stop.Longitude))
    .map((stop) => {
      const id = stop.RouteInstanceStopId ?? stop.RouteStopId;
      return { id, order: stop.StopOrder, name: stop.Name, latitude: stop.Latitude, longitude: stop.Longitude, status: stop.Status, isCurrent: id === currentId, color: stopStatusLook(stop.Status).color };
    });

/** Map stops for a plan preview (all pending, in the route colour). */
export const planMapStops = (stops: readonly RouteStopResultData[], color: string): RouteMapStop[] =>
  stops
    .filter((stop) => isMappable(stop.Latitude, stop.Longitude))
    .map((stop) => ({ id: stop.RouteStopId, order: stop.StopOrder, name: stop.Name, latitude: stop.Latitude, longitude: stop.Longitude, status: 0, isCurrent: false, color }));

/** Map stops from server directions waypoints. */
export const waypointMapStops = (waypoints: readonly RouteDirectionWaypointData[], currentId: string | null): RouteMapStop[] =>
  waypoints
    .filter((waypoint) => isMappable(waypoint.Latitude, waypoint.Longitude))
    .map((waypoint, index) => {
      const id = waypoint.RouteInstanceStopId ?? waypoint.RouteStopId ?? `waypoint-${index}`;
      return {
        id,
        order: waypoint.StopOrder,
        name: waypoint.Name ?? '',
        latitude: waypoint.Latitude,
        longitude: waypoint.Longitude,
        status: waypoint.Status,
        isCurrent: id === currentId,
        color: stopStatusLook(waypoint.Status).color,
      };
    });

/** Camera bounds over the stops, the line and (optionally) the unit's position. */
export const mapBounds = (stops: readonly RouteMapStop[], line: RouteGeometry | null, position?: { latitude: number; longitude: number } | null): RouteBounds | null => {
  const points: LngLat[] = [...stops.map((stop) => [stop.longitude, stop.latitude] as LngLat), ...geometryPositions(line)];
  if (position && isMappable(position.latitude, position.longitude)) points.push([position.longitude, position.latitude]);
  return boundsOf(points);
};

/** The geofence ring around a stop (its radius, else the plan's, else 100 m); null when the stop has no position. */
export const stopGeofence = (stop: Pick<RouteStopWithDetailsResultData, 'Latitude' | 'Longitude' | 'GeofenceRadiusMeters'> | null, planRadius?: number | null): LngLat[] | null => {
  if (!stop || !isMappable(stop.Latitude, stop.Longitude)) return null;
  const radius = stop.GeofenceRadiusMeters && stop.GeofenceRadiusMeters > 0 ? stop.GeofenceRadiusMeters : planRadius && planRadius > 0 ? planRadius : DEFAULT_GEOFENCE_RADIUS_M;
  return geofenceRing(stop.Latitude, stop.Longitude, radius);
};
