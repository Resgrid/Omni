import '../../unit-status/__tests__/test-setup';

import { RouteStopStatus } from '@resgrid/data';
import type { RouteDeviationResultData } from '@resgrid/models';

import { formatArrivalTime, formatDistance, formatDuration } from '../lib/route-format';
import { boundsOf, geofenceRing, isMappable, parseRouteGeometry } from '../lib/route-geo';
import { mapBounds, routeColor, stopGeofence } from '../lib/route-map';
import { canStartPlan, currentStop, deviationTypeKey, instanceDeviations, progressPercent, STOP_PRIORITY_LOOK, STOP_TYPE_KEYS, stopActions } from '../lib/route-status';
import { readRouteParam, unitRoutesRoutes } from '../routes';

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${Object.values(options).join(',')}` : key);

describe('parseRouteGeometry', () => {
  const line = [
    [-119.8, 39.5],
    [-119.7, 39.6],
  ];

  it('reads the GeoJSON shapes the server stores', () => {
    expect(parseRouteGeometry(JSON.stringify({ type: 'LineString', coordinates: line }))).toEqual({ type: 'LineString', coordinates: line });
    expect(parseRouteGeometry(JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }))).toEqual({ type: 'LineString', coordinates: line });
    expect(parseRouteGeometry(JSON.stringify(line))).toEqual({ type: 'LineString', coordinates: line });
    expect(parseRouteGeometry(JSON.stringify({ type: 'MultiLineString', coordinates: [line, line] }))?.type).toBe('MultiLineString');
    expect(
      parseRouteGeometry(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: line } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } },
          ],
        })
      )
    ).toEqual({ type: 'LineString', coordinates: line });
  });

  it('returns null for empty, malformed or degenerate geometry', () => {
    expect(parseRouteGeometry(null)).toBeNull();
    expect(parseRouteGeometry('')).toBeNull();
    expect(parseRouteGeometry('{not json')).toBeNull();
    expect(parseRouteGeometry(JSON.stringify({ type: 'LineString', coordinates: [[1, 2]] }))).toBeNull();
    expect(parseRouteGeometry(JSON.stringify({ type: 'Point', coordinates: [1, 2] }))).toBeNull();
  });
});

describe('geo helpers', () => {
  it('builds a closed geofence ring around the stop', () => {
    const ring = geofenceRing(39.5, -119.8, 100, 16);
    expect(ring).toHaveLength(17);
    expect(ring[0][0]).toBeCloseTo(ring[16][0], 10);
    expect(ring[0][1]).toBeCloseTo(39.5 + 100 / 6_371_000 / (Math.PI / 180), 6);
  });

  it('rejects the (0,0) sentinel and out-of-range points', () => {
    expect(isMappable(0, 0)).toBe(false);
    expect(isMappable(95, 10)).toBe(false);
    expect(isMappable(null, 10)).toBe(false);
    expect(isMappable(39.5, -119.8)).toBe(true);
  });

  it('computes bounds over stops, line and the unit position', () => {
    expect(boundsOf([])).toBeNull();
    const stops = [{ id: 'a', order: 1, name: 'A', latitude: 39.5, longitude: -119.8, status: 0, isCurrent: false, color: '#000' }];
    expect(
      mapBounds(
        stops,
        {
          type: 'LineString',
          coordinates: [
            [-120, 39],
            [-119.5, 39.4],
          ],
        },
        { latitude: 40, longitude: -119 }
      )
    ).toEqual({ ne: [-119, 40], sw: [-120, 39] });
  });

  it('uses the stop radius, else the plan radius, else 100 m for the geofence', () => {
    const at = { Latitude: 39.5, Longitude: -119.8 };
    const north = (ring: [number, number][] | null) => (ring ? ring[0][1] - 39.5 : 0);
    expect(north(stopGeofence({ ...at, GeofenceRadiusMeters: 200 }, 50))).toBeCloseTo(2 * north(stopGeofence({ ...at, GeofenceRadiusMeters: null }, 100)), 8);
    expect(north(stopGeofence({ ...at, GeofenceRadiusMeters: null }, null))).toBeCloseTo(north(stopGeofence({ ...at, GeofenceRadiusMeters: 100 }, null)), 8);
    expect(stopGeofence({ Latitude: 0, Longitude: 0, GeofenceRadiusMeters: 100 })).toBeNull();
  });

  it('normalises route colours', () => {
    expect(routeColor(null)).toBe('#3b82f6');
    expect(routeColor('ff0000')).toBe('#ff0000');
    expect(routeColor('#00ff00')).toBe('#00ff00');
  });
});

describe('formatting', () => {
  it('formats distance and duration', () => {
    expect(formatDistance(850.4)).toBe('850 m');
    expect(formatDistance(12_400)).toBe('12.4 km');
    expect(formatDistance(null)).toBe('');
    expect(formatDuration(45 * 60, t)).toBe('unit_routes.duration_minutes:45');
    expect(formatDuration(3900, t)).toBe('unit_routes.duration_hours_minutes:1,05');
    expect(formatDuration(0, t)).toBe('');
    expect(formatArrivalTime(null)).toBe('');
    expect(formatArrivalTime(600, Date.UTC(2026, 10, 1, 12, 0))).not.toBe('');
  });
});

describe('route status rules', () => {
  const stop = (order: number, status: number) => ({ StopOrder: order, Status: status });

  it('picks the checked-in stop, else the first pending one in route order', () => {
    expect(currentStop([stop(3, RouteStopStatus.Pending), stop(1, RouteStopStatus.CheckedOut), stop(2, RouteStopStatus.Pending)])).toEqual(stop(2, RouteStopStatus.Pending));
    expect(currentStop([stop(1, RouteStopStatus.Pending), stop(2, RouteStopStatus.CheckedIn)])).toEqual(stop(2, RouteStopStatus.CheckedIn));
    expect(currentStop([stop(1, RouteStopStatus.Skipped)])).toBeNull();
  });

  it('counts checked-out and skipped stops as done, else uses the instance counters', () => {
    expect(progressPercent([stop(1, RouteStopStatus.CheckedOut), stop(2, RouteStopStatus.Skipped), stop(3, RouteStopStatus.Pending), stop(4, RouteStopStatus.CheckedIn)])).toBe(50);
    expect(progressPercent([], { StopsCompleted: 1, StopsTotal: 4 })).toBe(25);
    expect(progressPercent([], null)).toBe(0);
  });

  it('offers check in, check out and skip by status', () => {
    expect(stopActions({ Status: RouteStopStatus.Pending })).toEqual(['checkIn', 'skip']);
    expect(stopActions({ Status: RouteStopStatus.CheckedIn })).toEqual(['checkOut', 'skip']);
    expect(stopActions({ Status: RouteStopStatus.CheckedOut })).toEqual([]);
  });

  it('lets a unit start unassigned plans and its own, comparing ids as strings', () => {
    expect(canStartPlan(null, '10')).toBe(true);
    expect(canStartPlan(10, '10')).toBe(true);
    expect(canStartPlan(11, '10')).toBe(false);
    expect(canStartPlan(null, null)).toBe(false);
  });

  it('keeps only this instance’s unacknowledged deviations, newest first', () => {
    const deviation = (id: string, instanceId: string, detected: string, ack = false): RouteDeviationResultData => ({
      RouteDeviationId: id,
      RouteInstanceId: instanceId,
      DetectedOn: detected,
      Latitude: 0,
      Longitude: 0,
      DeviationDistanceMeters: 300,
      DeviationType: 0,
      IsAcknowledged: ack,
      AcknowledgedByUserId: null,
      AcknowledgedOn: null,
      Notes: null,
    });
    const rows = [deviation('a', 'ri-1', '2026-11-01T10:00:00Z'), deviation('b', 'ri-2', '2026-11-01T11:00:00Z'), deviation('c', 'ri-1', '2026-11-01T12:00:00Z'), deviation('d', 'ri-1', '2026-11-01T13:00:00Z', true)];
    expect(instanceDeviations(rows, 'ri-1').map((row) => row.RouteDeviationId)).toEqual(['c', 'a']);
    expect(instanceDeviations(rows, null)).toEqual([]);
  });

  it('labels Core stop types, priorities and deviation types correctly', () => {
    expect(STOP_TYPE_KEYS[1]).toBe('unit_routes.stop_type.scheduled_call');
    expect(STOP_PRIORITY_LOOK[1].labelKey).toBe('routes.priority_high');
    expect(STOP_PRIORITY_LOOK[3].labelKey).toBe('unit_routes.priority_optional');
    expect(deviationTypeKey(1)).toBe('routes.deviation_type_missed_stop');
    expect(deviationTypeKey(9)).toBe('routes.deviation_type_other');
  });
});

describe('routes', () => {
  it('builds the routes stack hrefs', () => {
    expect(unitRoutesRoutes.list()).toBe('/routes');
    expect(unitRoutesRoutes.start('p 1')).toBe('/routes/start?planId=p%201');
    expect(unitRoutesRoutes.active('p1', 'i1')).toBe('/routes/active?planId=p1&instanceId=i1');
    expect(unitRoutesRoutes.active()).toBe('/routes/active');
    expect(unitRoutesRoutes.directions('i1')).toBe('/routes/directions?instanceId=i1');
    expect(unitRoutesRoutes.poi(12)).toBe('/routes/poi/12');
    expect(unitRoutesRoutes.stop('s1')).toBe('/routes/stop/s1');
    expect(unitRoutesRoutes.stopContact('rs1')).toBe('/routes/stop/contact?stopId=rs1');
    expect(unitRoutesRoutes.history('p1')).toBe('/routes/history/p1');
    expect(unitRoutesRoutes.instance('i1')).toBe('/routes/history/instance/i1');
  });

  it('refuses ids that could leave the routes tree', () => {
    expect(() => unitRoutesRoutes.stop('../x')).toThrow();
    expect(() => unitRoutesRoutes.poi(0)).toThrow();
    expect(readRouteParam(['abc', 'def'])).toBe('abc');
    expect(readRouteParam('undefined')).toBeNull();
    expect(readRouteParam('a/b')).toBeNull();
    expect(readRouteParam(undefined)).toBeNull();
  });
});
