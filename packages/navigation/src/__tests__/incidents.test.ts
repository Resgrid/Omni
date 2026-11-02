import type { RouteIncidentData } from '@resgrid/models';

import { INCIDENT_MAX_OFFSET_METERS, incidentKind, incidentsAhead, placeIncidents } from '../engine/incidents';
import { parseNavRoute } from '../engine/route-model';
import { buildRouteObject, EAST_LEG, NORTH_LEG } from './fixtures';

const incident = (overrides: Partial<RouteIncidentData>): RouteIncidentData => ({ Type: 'accident', Description: null, Impact: 'major', Latitude: null, Longitude: null, Closed: false, ...overrides });

describe('route incidents', () => {
  const route = parseNavRoute(buildRouteObject());
  if (!route) throw new Error('no route');

  it('places incidents along the route in route order and leaves out those off it or without a position', () => {
    const north = incident({ Type: 'construction', Latitude: NORTH_LEG[3][1], Longitude: NORTH_LEG[3][0] + 0.0005 });
    const east = incident({ Type: 'road_closure', Closed: true, Latitude: EAST_LEG[2][1], Longitude: EAST_LEG[2][0] });
    const parallelRoad = incident({ Latitude: EAST_LEG[2][1] + 0.01, Longitude: EAST_LEG[2][0] });
    const placed = placeIncidents(route, [north, incident({}), parallelRoad, east]);
    expect(placed.map((entry) => entry.incident)).toEqual([east, north]);
    expect(placed[0].along).toBeCloseTo(route.cumulative[2], 0);
    expect(INCIDENT_MAX_OFFSET_METERS).toBeLessThan(1000);
  });

  it('lists the incidents still ahead, nearest first, with the distance to each', () => {
    const placed = placeIncidents(route, [
      incident({ Latitude: EAST_LEG[2][1], Longitude: EAST_LEG[2][0] }),
      incident({ Latitude: NORTH_LEG[3][1], Longitude: NORTH_LEG[3][0] }),
      incident({ Latitude: NORTH_LEG[4][1], Longitude: NORTH_LEG[4][0] }),
    ]);
    const atStart = incidentsAhead(placed, 0);
    expect(atStart).toHaveLength(2);
    expect(atStart[0].ahead).toBeCloseTo(placed[0].along, 6);
    // Past the first one: it drops off and the third moves up.
    const later = incidentsAhead(placed, placed[0].along + 1);
    expect(later.map((entry) => entry.along)).toEqual([placed[1].along, placed[2].along]);
    expect(incidentsAhead(placed, route.distance)).toEqual([]);
  });

  it('names the provider’s incident types, a closure without a type included', () => {
    expect(incidentKind({ Type: 'Accident', Closed: false })).toBe('accident');
    expect(incidentKind({ Type: 'lane_restriction', Closed: false })).toBe('lane_restriction');
    expect(incidentKind({ Type: 'mass_transit', Closed: false })).toBe('other');
    expect(incidentKind({ Type: null, Closed: true })).toBe('road_closure');
  });
});
