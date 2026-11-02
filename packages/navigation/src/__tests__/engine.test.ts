import {
  canReroute,
  computeProgress,
  createRouteSimulator,
  currentBanner,
  decodePolyline,
  dueVoiceInstructions,
  encodePolyline,
  formatDistance,
  hasArrived,
  INITIAL_OFF_ROUTE_STATE,
  maneuverIconKey,
  minutesRemaining,
  type NavProgress,
  type NavRoute,
  parseNavRoute,
  shouldReportProgress,
  sliceLine,
  startProgress,
  unitsForLocale,
  updateOffRoute,
} from '../engine';
import { buildRouteObject, buildTwoLegRouteObject, CORNER, DESTINATION, EAST_LEG, fix, NORTH_LEG, offsetNorth, ORIGIN } from './fixtures';

const route = (): NavRoute => {
  const parsed = parseNavRoute(buildRouteObject());
  if (!parsed) throw new Error('fixture route did not parse');
  return parsed;
};

describe('polyline6', () => {
  it('round-trips coordinates at precision 6 and 5', () => {
    const points = [ORIGIN, CORNER, DESTINATION];
    expect(decodePolyline(encodePolyline(points))).toEqual(points.map(([lon, lat]) => [expect.closeTo(lon, 6), expect.closeTo(lat, 6)]));
    expect(decodePolyline(encodePolyline(points, 5), 5)[1]).toEqual([expect.closeTo(CORNER[0], 5), expect.closeTo(CORNER[1], 5)]);
  });

  it('decodes the reference polyline5 string', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('stops at the last whole point of a truncated string', () => {
    expect(decodePolyline('_p~iF~ps|U_ulL', 5)).toHaveLength(1);
  });
});

describe('parseNavRoute', () => {
  it('builds the geometry from the step geometries with steps on one ruler', () => {
    const r = route();
    expect(r.coordinates).toHaveLength(EAST_LEG.length + NORTH_LEG.length - 1);
    expect(r.distance).toBeGreaterThan(1000);
    expect(r.steps.map((step) => step.maneuver.type)).toEqual(['depart', 'turn', 'arrive']);
    expect(r.steps[0].startDistance).toBe(0);
    expect(r.steps[1].startDistance).toBeCloseTo(r.steps[0].endDistance);
    expect(r.steps[2].startDistance).toBeCloseTo(r.distance);
    expect(r.hasInstructions).toBe(true);
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].destination).toEqual(DESTINATION);
  });

  it('places voice prompts and banners by distance before the end of their step', () => {
    const r = route();
    const [departNow, turnSoon] = r.steps[0].voice;
    expect(departNow.triggerAt).toBe(0);
    expect(turnSoon.triggerAt).toBeCloseTo(r.steps[0].endDistance - 150);
    expect(r.steps[0].banners[0]).toMatchObject({ showFrom: 0, primary: { text: 'North Avenue', type: 'turn', modifier: 'left' } });
  });

  it('falls back to the overview geometry and maneuver locations when steps have none', () => {
    const object = buildRouteObject();
    const stripped = { ...object, legs: object.legs.map((leg) => ({ ...leg, steps: leg.steps.map(({ geometry: _g, ...step }) => step) })) };
    const r = parseNavRoute(stripped);
    expect(r?.steps[1].startDistance).toBeCloseTo(route().steps[1].startDistance, 0);
  });

  it('draws the GeoJSON line alone when the route object is missing', () => {
    const r = parseNavRoute(null, JSON.stringify({ type: 'LineString', coordinates: [ORIGIN, CORNER, DESTINATION] }));
    expect(r?.steps).toEqual([]);
    expect(r?.hasInstructions).toBe(false);
    expect(r?.legs[0].destination).toEqual(DESTINATION);
  });

  it('returns null without usable geometry', () => {
    expect(parseNavRoute({ legs: [] })).toBeNull();
    expect(parseNavRoute(null, 'not json')).toBeNull();
  });

  it('splits legs at the stops of a multi-stop route', () => {
    const r = parseNavRoute(buildTwoLegRouteObject());
    expect(r?.legs).toHaveLength(2);
    expect(r?.legs[0].destination).toEqual(CORNER);
    expect(r?.legs[1].startDistance).toBeCloseTo(r?.legs[0].endDistance ?? -1);
  });
});

describe('progress', () => {
  it('snaps a fix beside the road and measures what is left', () => {
    const r = route();
    const p = computeProgress(r, fix(offsetNorth(EAST_LEG[3], 8)), null);
    expect(p.distanceFromRoute).toBeCloseTo(8, 0);
    expect(p.stepIndex).toBe(0);
    expect(p.distanceAlong).toBeCloseTo(r.cumulative[3], 0);
    expect(p.distanceToManeuver).toBeCloseTo(r.steps[0].endDistance - r.cumulative[3], 0);
    expect(p.durationRemaining).toBeGreaterThan(50);
    expect(p.durationRemaining).toBeLessThan(110);
    expect(p.routeBearing).toBeCloseTo(90, 0);
  });

  it('moves to the next step after the turn', () => {
    const r = route();
    const p = computeProgress(r, fix(NORTH_LEG[2]), { distanceAlong: r.steps[0].endDistance - 10 });
    expect(p.stepIndex).toBe(1);
    expect(p.routeBearing).toBeCloseTo(0, 0);
    expect(p.distanceRemaining).toBeCloseTo(r.distance - p.distanceAlong);
  });

  it('starts at zero with the full duration ahead', () => {
    const r = route();
    expect(startProgress(r)).toMatchObject({ distanceAlong: 0, stepIndex: 0, durationRemaining: 110 });
  });

  it('keeps to the window around the last position on a route that doubles back', () => {
    const outAndBack = parseNavRoute(null, JSON.stringify({ type: 'LineString', coordinates: [EAST_LEG[0], EAST_LEG[6], offsetNorth(EAST_LEG[0], 3)] }));
    if (!outAndBack) throw new Error('no route');
    const nearStartOnTheWayBack = computeProgress(outAndBack, fix(offsetNorth(EAST_LEG[1], 2)), { distanceAlong: outAndBack.cumulative[1] + 400 });
    expect(nearStartOnTheWayBack.segmentIndex).toBe(1);
  });
});

describe('off-route', () => {
  const r = route();
  const progressFor = (distanceFromRoute: number, routeBearing = 90): NavProgress => ({ ...startProgress(r), distanceFromRoute, routeBearing });

  it('needs three fixes beyond the threshold in a row', () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    state = updateOffRoute(state, progressFor(45), fix(ORIGIN));
    state = updateOffRoute(state, progressFor(45), fix(ORIGIN));
    expect(state.offRoute).toBe(false);
    state = updateOffRoute(state, progressFor(10), fix(ORIGIN));
    expect(state.strikes).toBe(0);
    for (let i = 0; i < 3; i += 1) state = updateOffRoute(state, progressFor(45), fix(ORIGIN));
    expect(state.offRoute).toBe(true);
  });

  it('widens the threshold with poor accuracy and ignores unusable fixes', () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    for (let i = 0; i < 3; i += 1) state = updateOffRoute(state, progressFor(45), fix(ORIGIN, { accuracy: 40 }));
    expect(state.offRoute).toBe(false);
    state = updateOffRoute(state, progressFor(500), fix(ORIGIN, { accuracy: 300 }));
    expect(state).toEqual(expect.objectContaining({ strikes: 0, offRoute: false }));
  });

  it('flags driving against the route for five seconds', () => {
    let state = INITIAL_OFF_ROUTE_STATE;
    state = updateOffRoute(state, progressFor(5), fix(ORIGIN, { heading: 270, speed: 10, timestamp: 0 }));
    state = updateOffRoute(state, progressFor(5), fix(ORIGIN, { heading: 268, speed: 10, timestamp: 4_000 }));
    expect(state.offRoute).toBe(false);
    state = updateOffRoute(state, progressFor(5), fix(ORIGIN, { heading: 272, speed: 10, timestamp: 5_000 }));
    expect(state.offRoute).toBe(true);
  });

  it('limits reroutes by interval and per session', () => {
    expect(canReroute(20_000, null, 0)).toBe(true);
    expect(canReroute(20_000, 15_000, 1)).toBe(false);
    expect(canReroute(25_000, 15_000, 1)).toBe(true);
    expect(canReroute(100_000, 0, 30)).toBe(false);
  });
});

describe('voice and banner', () => {
  it('speaks the depart prompt at the start and the turn prompt 150 m before the turn', () => {
    const r = route();
    const spoken = new Set<string>();
    const first = dueVoiceInstructions(r, startProgress(r), spoken);
    expect(first.speak?.announcement).toContain('Drive east');
    first.markSpoken.forEach((id) => spoken.add(id));
    expect(dueVoiceInstructions(r, computeProgress(r, fix(EAST_LEG[2]), null), spoken).speak).toBeNull();
    const nearTurn = computeProgress(r, fix(EAST_LEG[5]), null);
    expect(dueVoiceInstructions(r, nearTurn, spoken).speak?.announcement).toContain('turn left');
  });

  it('speaks only the newest of several due prompts and drops prompts for maneuvers already passed', () => {
    const r = route();
    const late = computeProgress(r, fix(EAST_LEG[6]), null);
    const result = dueVoiceInstructions(r, late, new Set());
    expect(result.speak?.announcement).toContain('turn left');
    expect(result.markSpoken).toHaveLength(2);
    const pastTheTurn = computeProgress(r, fix(NORTH_LEG[1]), { distanceAlong: r.steps[0].endDistance });
    expect(dueVoiceInstructions(r, pastTheTurn, new Set(['1:0'])).speak).toBeNull();
  });

  it('shows the provider banner for the next maneuver, else the next maneuver text', () => {
    const r = route();
    expect(currentBanner(r, startProgress(r))).toMatchObject({ primary: { text: 'North Avenue' }, maneuverType: 'turn', modifier: 'left' });
    const plain = parseNavRoute(buildRouteObject({ withInstructions: false }));
    if (!plain) throw new Error('no route');
    expect(plain.hasInstructions).toBe(false);
    expect(currentBanner(plain, startProgress(plain))).toMatchObject({ primary: { text: 'Turn left onto North Avenue' }, maneuverType: 'turn' });
  });

  it('maps maneuvers to icon keys', () => {
    expect(maneuverIconKey('turn', 'left')).toBe('left');
    expect(maneuverIconKey('turn', 'slight right')).toBe('slight-right');
    expect(maneuverIconKey('continue', 'uturn')).toBe('uturn');
    expect(maneuverIconKey('fork', 'slight left')).toBe('fork-left');
    expect(maneuverIconKey('off ramp', 'right')).toBe('ramp-right');
    expect(maneuverIconKey('roundabout', 'right')).toBe('roundabout');
    expect(maneuverIconKey('arrive', null)).toBe('arrive');
    expect(maneuverIconKey('new name', null)).toBe('straight');
  });
});

describe('arrival, ETA reports, formatting, simulation', () => {
  it('arrives within the radius of the destination or at the end of the leg', () => {
    const r = route();
    expect(hasArrived(r, computeProgress(r, fix(NORTH_LEG[3]), null), fix(NORTH_LEG[3]))).toBe(false);
    const near = offsetNorth(DESTINATION, -30);
    expect(hasArrived(r, computeProgress(r, fix(near), null), fix(near))).toBe(true);
  });

  it('arrives at each stop of a multi-stop route', () => {
    const twoLegs = parseNavRoute(buildTwoLegRouteObject());
    if (!twoLegs) throw new Error('no route');
    const atCorner = computeProgress(twoLegs, fix(EAST_LEG[6]), null);
    expect(hasArrived(twoLegs, atCorner, fix(EAST_LEG[6]), 50, 0)).toBe(true);
    expect(hasArrived(twoLegs, atCorner, fix(EAST_LEG[6]), 50, 1)).toBe(false);
    const beforeCorner = computeProgress(twoLegs, fix(EAST_LEG[4]), null);
    expect(beforeCorner.legIndex).toBe(0);
    expect(hasArrived(twoLegs, beforeCorner, fix(EAST_LEG[4]))).toBe(false);
  });

  it('reports progress at most every 15 s, on a 20 s ETA change or after a quiet minute', () => {
    expect(shouldReportProgress(null, 0, 600_000)).toBe(true);
    expect(shouldReportProgress({ at: 0, etaMs: 600_000 }, 10_000, 700_000)).toBe(false);
    expect(shouldReportProgress({ at: 0, etaMs: 600_000 }, 16_000, 610_000)).toBe(false);
    expect(shouldReportProgress({ at: 0, etaMs: 600_000 }, 16_000, 625_000)).toBe(true);
    expect(shouldReportProgress({ at: 0, etaMs: 600_000 }, 61_000, 600_000)).toBe(true);
  });

  it('formats distances for drivers and picks units from the locale', () => {
    expect(formatDistance(42, 'metric')).toEqual({ value: 40, unit: 'm' });
    expect(formatDistance(1_540, 'metric')).toEqual({ value: 1.5, unit: 'km' });
    expect(formatDistance(23_400, 'metric')).toEqual({ value: 23, unit: 'km' });
    expect(formatDistance(100, 'imperial')).toEqual({ value: 350, unit: 'ft' });
    expect(formatDistance(3_300, 'imperial')).toEqual({ value: 2.1, unit: 'mi' });
    expect(unitsForLocale('en-US')).toBe('imperial');
    expect(unitsForLocale('de-DE')).toBe('metric');
    expect(unitsForLocale('en')).toBe('metric');
    expect(minutesRemaining(20)).toBe(1);
    expect(minutesRemaining(0)).toBe(0);
  });

  it('replays the route at a fixed speed and ends past the destination', () => {
    const r = route();
    const simulator = createRouteSimulator(r, { speedMps: 10, startAt: 1_000 });
    const tenSeconds = simulator.fixAt(10_000);
    expect(tenSeconds).toMatchObject({ speed: 10, timestamp: 11_000 });
    expect(computeProgress(r, tenSeconds as NonNullable<typeof tenSeconds>, null).distanceAlong).toBeCloseTo(100, 0);
    expect(simulator.fixAt(1_000_000)).toBeNull();
  });

  it('slices the traversed part of the line', () => {
    const r = route();
    const traversed = sliceLine(r.coordinates, r.cumulative, 0, 200);
    expect(traversed[0]).toEqual(ORIGIN);
    expect(traversed.length).toBeGreaterThan(2);
    expect(sliceLine(r.coordinates, r.cumulative, 300, 100)).toEqual([]);
  });
});
