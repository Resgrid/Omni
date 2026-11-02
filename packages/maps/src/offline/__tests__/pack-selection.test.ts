import { distanceToBoundsKm, EMPTY_PACK_FOCUS, isExtraPackWanted, NO_EXTRA_PACKS, resolveExtraPackPolicy } from '../pack-selection';
import type { PackBounds } from '../types';

type Facts = Parameters<typeof resolveExtraPackPolicy>[0];

/** The five apps' facts as their variant.json files declare them (capabilities and profile only — never the id). */
const VARIANTS: Record<string, Facts> = {
  responder: {
    offline: { cacheTtl: 'short', storageBudgetMb: 150, mapPacks: 'full' },
    modules: ['member-home', 'calendar', 'shifts', 'messages', 'staffing', 'work-orders', 'certifications', 'approve-sign-in'],
    capabilities: { location: { background: true, transmission: 'person', geoHubDefault: false }, incidentCommand: 'view', maps: { layers: true, customIndoor: false, navigationInApp: false } },
  },
  unit: {
    offline: { cacheTtl: 'long', storageBudgetMb: 200, mapPacks: 'full' },
    modules: ['unit-status', 'unit-routes', 'inventory'],
    capabilities: { location: { background: true, transmission: 'unit', geoHubDefault: true }, incidentCommand: 'view', maps: { layers: true, customIndoor: true, navigationInApp: true } },
  },
  ic: {
    offline: { cacheTtl: 'long', storageBudgetMb: 250, mapPacks: 'full' },
    modules: ['incident-command'],
    capabilities: { location: { background: false, transmission: 'none', geoHubDefault: true }, incidentCommand: 'command', maps: { layers: true, customIndoor: true, navigationInApp: false } },
  },
  dispatch: {
    offline: { cacheTtl: 'short', storageBudgetMb: 200, mapPacks: 'full' },
    modules: ['dispatch-console', 'runcards', 'call-queues', 'awaiting-resources'],
    capabilities: { location: { background: false, transmission: 'none', geoHubDefault: true }, incidentCommand: 'assist', maps: { layers: true, customIndoor: true, navigationInApp: false } },
  },
  bigboard: {
    offline: { cacheTtl: 'short', storageBudgetMb: 100, mapPacks: 'display' },
    modules: ['dashboard'],
    capabilities: { location: { background: false, transmission: 'none', geoHubDefault: true }, incidentCommand: 'none', maps: { layers: true, customIndoor: false, navigationInApp: false } },
  },
};

// One z10 cell east of Sacramento (≈ 0.35° wide).
const CELL: PackBounds = [-121.2890625, 38.272688535980954, -120.9375, 38.54816542304657];

describe('resolveExtraPackPolicy (plan §19.7)', () => {
  it('gives Unit incidents and corridors, IC and Responder incidents, Dispatch and BigBoard nothing extra', () => {
    expect(resolveExtraPackPolicy(VARIANTS.unit)).toEqual({ incidents: true, corridors: true });
    expect(resolveExtraPackPolicy(VARIANTS.ic)).toEqual({ incidents: true, corridors: false });
    expect(resolveExtraPackPolicy(VARIANTS.responder)).toEqual({ incidents: true, corridors: false });
    expect(resolveExtraPackPolicy(VARIANTS.dispatch)).toEqual(NO_EXTRA_PACKS);
    expect(resolveExtraPackPolicy(VARIANTS.bigboard)).toEqual(NO_EXTRA_PACKS);
  });

  it('turns everything off for a display profile whatever the capabilities', () => {
    expect(resolveExtraPackPolicy({ ...VARIANTS.unit, offline: { ...VARIANTS.unit.offline, mapPacks: 'display' } })).toEqual(NO_EXTRA_PACKS);
  });
});

describe('isExtraPackWanted', () => {
  const both = { incidents: true, corridors: true };

  it('measures the distance from a point to a cell (0 inside)', () => {
    expect(distanceToBoundsKm([-121.1, 38.4], CELL)).toBe(0);
    expect(distanceToBoundsKm([-121.4, 38.4], CELL)).toBeGreaterThan(9);
    expect(distanceToBoundsKm([-121.4, 38.4], CELL)).toBeLessThan(10.5);
  });

  const near = { ...EMPTY_PACK_FOCUS, incidentPoints: [[-121.1, 38.4]] as [number, number][] };

  it('keeps an incident cell near a focus call and drops the others when the server lists no ids', () => {
    expect(isExtraPackWanted('incident', { bounds: CELL }, both, near)).toBe(true);
    expect(isExtraPackWanted('incident', { bounds: CELL }, both, { ...EMPTY_PACK_FOCUS, incidentPoints: [[-121.35, 38.4]] })).toBe(true);
    expect(isExtraPackWanted('incident', { bounds: CELL }, both, { ...EMPTY_PACK_FOCUS, incidentPoints: [[-122.5, 38.4]] })).toBe(false);
    expect(isExtraPackWanted('incident', { bounds: CELL }, both, EMPTY_PACK_FOCUS)).toBe(false);
    expect(isExtraPackWanted('incident', { bounds: null }, both, near)).toBe(false);
    expect(isExtraPackWanted('incident', { bounds: CELL }, NO_EXTRA_PACKS, near)).toBe(false);
  });

  it('keeps a corridor cell the route passes through, even between distant vertices', () => {
    // A straight line whose vertices are both outside the cell but crosses it.
    const crossing = {
      ...EMPTY_PACK_FOCUS,
      corridorLines: [
        [
          [-121.6, 38.4],
          [-120.6, 38.4],
        ] as [number, number][],
      ],
    };
    expect(isExtraPackWanted('corridor', { bounds: CELL }, both, crossing)).toBe(true);
    expect(isExtraPackWanted('corridor', { bounds: CELL }, { incidents: true, corridors: false }, crossing)).toBe(false);
    const away = {
      ...EMPTY_PACK_FOCUS,
      corridorLines: [
        [
          [-121.6, 39.4],
          [-120.6, 39.4],
        ] as [number, number][],
      ],
    };
    expect(isExtraPackWanted('corridor', { bounds: CELL }, both, away)).toBe(false);
  });

  it('matches the calls and route plans Core lists on a cell, whatever its kind or position', () => {
    const focus = { ...near, callIds: ['15'], routePlanIds: ['plan-north'] };
    // Listed ids decide, even where the focus position is inside the cell.
    expect(isExtraPackWanted('incident', { bounds: CELL, callIds: ['14'], routePlanIds: [] }, both, focus)).toBe(false);
    expect(isExtraPackWanted('incident', { bounds: null, callIds: ['14', '15'], routePlanIds: [] }, both, focus)).toBe(true);
    // A shared cell: an incident cell on the route, a corridor cell at the call.
    expect(isExtraPackWanted('incident', { callIds: ['14'], routePlanIds: ['plan-north'] }, both, focus)).toBe(true);
    expect(isExtraPackWanted('corridor', { callIds: ['15'], routePlanIds: ['plan-south'] }, both, focus)).toBe(true);
    // Each id kind only where the policy takes that kind of pack.
    expect(isExtraPackWanted('corridor', { callIds: [], routePlanIds: ['plan-north'] }, { incidents: true, corridors: false }, focus)).toBe(false);
    expect(isExtraPackWanted('incident', { callIds: ['15'], routePlanIds: null }, { incidents: false, corridors: true }, focus)).toBe(false);
    expect(isExtraPackWanted('incident', { bounds: CELL, callIds: [], routePlanIds: [] }, both, focus)).toBe(false);
  });

  it('always keeps every other kind', () => {
    for (const kind of ['basemap', 'custom-map', 'department-data', 'sprite', 'style', 'glyphs', 'indoor-floor'] as const) {
      expect(isExtraPackWanted(kind, {}, NO_EXTRA_PACKS, EMPTY_PACK_FOCUS)).toBe(true);
    }
  });
});
