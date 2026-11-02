import type { RouteIncidentData } from '@resgrid/models';

import { isValidLngLat, type LngLat, projectOnSegment } from './geo';
import type { NavRoute } from './route-model';

/** An incident the provider reported on the route (accident, closure, construction…), placed along it. */
export interface PlacedIncident {
  incident: RouteIncidentData;
  /** Metres from the route's start to the point on the route nearest the incident. */
  along: number;
}

/** An incident further than this from the line is not on this route (a parallel road, the other carriageway's ramp). */
export const INCIDENT_MAX_OFFSET_METERS = 150;

/** Kinds the app names; anything else the provider sends shows as `other`. */
export const INCIDENT_KINDS = ['accident', 'construction', 'road_closure', 'congestion', 'lane_restriction'] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number] | 'other';

export const incidentKind = (incident: Pick<RouteIncidentData, 'Type' | 'Closed'>): IncidentKind => {
  const type = (incident.Type ?? '').trim().toLowerCase();
  const known = INCIDENT_KINDS.find((kind) => kind === type);
  return known ?? (incident.Closed ? 'road_closure' : 'other');
};

/**
 * Places the route's incidents along it (once per route): each at its nearest point on the line, in route order.
 * Incidents with no position, or too far from the line to be on it, are left out.
 */
export function placeIncidents(route: NavRoute, incidents: readonly RouteIncidentData[]): PlacedIncident[] {
  const placed: PlacedIncident[] = [];
  for (const incident of incidents) {
    const point: LngLat = [incident.Longitude ?? Number.NaN, incident.Latitude ?? Number.NaN];
    if (!isValidLngLat(point)) continue;
    let best: { distance: number; along: number } | null = null;
    for (let i = 0; i < route.coordinates.length - 1; i += 1) {
      const projection = projectOnSegment(point, route.coordinates[i], route.coordinates[i + 1]);
      if (!best || projection.distance < best.distance) {
        best = { distance: projection.distance, along: route.cumulative[i] + (route.cumulative[i + 1] - route.cumulative[i]) * projection.t };
      }
    }
    if (best && best.distance <= INCIDENT_MAX_OFFSET_METERS) placed.push({ incident, along: best.along });
  }
  return placed.sort((a, b) => a.along - b.along);
}

/** The incidents still ahead of `distanceAlong`, nearest first, with the distance to each. */
export const incidentsAhead = (placed: readonly PlacedIncident[], distanceAlong: number, limit = 2): (PlacedIncident & { ahead: number })[] =>
  placed
    .filter((entry) => entry.along >= distanceAlong)
    .slice(0, limit)
    .map((entry) => ({ ...entry, ahead: entry.along - distanceAlong }));
