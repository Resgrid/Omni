import { CustomMapType } from '@resgrid/models';

import { useMapViewStore } from '../hooks/use-map-view-store';
import {
  type FacilityBounds,
  facilityBounds,
  facilityFeatureOf,
  facilityLevels,
  facilityMapKey,
  facilityMapListings,
  geometryCenter,
  lockedViewBounds,
  parseFacilityMapKey,
  resolvedLevelId,
  resolveFacilityLayers,
} from '../lib/facility-maps';
import { BUILDING_A, BUILDING_A_DETAIL, GROUND_FLOOR, SITE_PLAN, SITE_PLAN_DETAIL } from './facility-fixtures';

// The pure helpers only need the maps package's geometry checks.
jest.mock('@resgrid/maps', () => ({
  ...jest.requireActual('@resgrid/maps/lib/pixel-frame'),
  isSafeMapUrl: jest.requireActual('@resgrid/maps/provider/url-safety').isSafeMapUrl,
}));

const custom = { kind: 'custom' as const, data: SITE_PLAN_DETAIL };
const [BASE_LAYER] = SITE_PLAN_DETAIL.Layers.filter((layer) => layer.IndoorMapFloorId === 'site-base');
const [CONTROL] = GROUND_FLOOR.Zones;

/** Degrees compared to about a centimetre. */
const expectNear = (actual: readonly number[] | null | undefined, expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual?.[index]).toBeCloseTo(value, 7));
};

const indoor = { kind: 'indoor' as const, data: BUILDING_A_DETAIL };

describe('facility map keys', () => {
  it('round-trips kind and id and refuses anything else', () => {
    expect(facilityMapKey('indoor', 'bldg-a')).toBe('indoor:bldg-a');
    expect(parseFacilityMapKey('indoor:bldg-a')).toEqual({ kind: 'indoor', mapId: 'bldg-a' });
    expect(parseFacilityMapKey('custom:a:b')).toEqual({ kind: 'custom', mapId: 'a:b' });
    expect(parseFacilityMapKey('layer:x')).toBeNull();
    expect(parseFacilityMapKey('custom:')).toBeNull();
    expect(parseFacilityMapKey('nothing')).toBeNull();
  });
});

describe('facilityMapListings', () => {
  it('lists custom maps (not the indoor ones, which come from the indoor list) then indoor maps, by name, with their kind', () => {
    const indoorTyped = { ...SITE_PLAN, IndoorMapId: 'dup', Name: 'Aaa indoor copy', MapType: CustomMapType.Indoor };
    const event = { ...SITE_PLAN, IndoorMapId: 'fair', Name: 'Annual open day', MapType: CustomMapType.Event };
    const listings = facilityMapListings([SITE_PLAN, indoorTyped, event], [BUILDING_A]);
    expect(listings.map((listing) => [listing.key, listing.typeKey])).toEqual([
      ['custom:fair', 'maps.event'],
      ['custom:site', 'maps.outdoor'],
      ['indoor:bldg-a', 'maps.indoor'],
    ]);
    expect(listings[2]?.bounds).toEqual({ ne: [-106.49, 35.01], sw: [-106.5, 35.0] });
  });

  it('lists a site plan once although GetIndoorMaps returns it too (one table in Core)', () => {
    const sitePlanAsIndoor = { ...BUILDING_A, IndoorMapId: SITE_PLAN.IndoorMapId, Name: SITE_PLAN.Name };
    const listings = facilityMapListings([SITE_PLAN], [sitePlanAsIndoor, BUILDING_A]);
    expect(listings.map((listing) => listing.key)).toEqual(['custom:site', 'indoor:bldg-a']);
  });
});

describe('levels and layers', () => {
  it('lists the drawable layers and floors in order, and picks the level a choice shows', () => {
    expect(facilityLevels(custom)).toEqual([
      { id: 'site-base', name: 'Site plan' },
      { id: 'site-evac', name: 'Evacuation routes' },
    ]);
    expect(facilityLevels(indoor).map((level) => level.id)).toEqual(['floor-1', 'floor-2']);
    // A custom map shows every layer with none chosen; an indoor map its default floor.
    expect(resolvedLevelId(custom, null)).toBeNull();
    expect(resolvedLevelId(custom, 'gone')).toBeNull();
    expect(resolvedLevelId(indoor, null)).toBe('floor-1');
    expect(resolvedLevelId(indoor, 'floor-2')).toBe('floor-2');
    expect(resolvedLevelId({ kind: 'indoor', data: { ...BUILDING_A_DETAIL, Map: { ...BUILDING_A, DefaultFloorId: null } } }, 'gone')).toBe('floor-1');
  });

  it('leaves out pixel-only layers (no geographic bounds, on the layer or its map) and uses an indoor floor’s own read for its zones', () => {
    const pixelOnly = { ...BASE_LAYER, IndoorMapFloorId: 'pixel', BoundsNELat: null };
    const unplacedMap = { ...SITE_PLAN, BoundsNELat: 0, BoundsNELon: 0, BoundsSWLat: 0, BoundsSWLon: 0 };
    const withPixel = { kind: 'custom' as const, data: { Map: unplacedMap, Layers: [...SITE_PLAN_DETAIL.Layers, pixelOnly] } };
    expect(resolveFacilityLayers('custom:site', withPixel, null).map((entry) => (entry.kind === 'custom' ? entry.layer.IndoorMapFloorId : ''))).toEqual(['site-base', 'site-evac']);
    expect(resolveFacilityLayers('custom:site', withPixel, 'site-evac')).toHaveLength(1);

    const [withoutRead] = resolveFacilityLayers('indoor:bldg-a', indoor, null);
    expect(withoutRead?.kind === 'indoor' ? withoutRead.floor.Zones : null).toEqual([]);
    const [withRead] = resolveFacilityLayers('indoor:bldg-a', indoor, null, { 'floor-1': GROUND_FLOOR });
    expect(withRead?.kind === 'indoor' ? withRead.floor.Zones.map((zone) => zone.Name) : null).toEqual(['Control room']);
  });

  it('places a layer or floor with no bounds of its own over its map, as Core’s tile renderer does (maps made on the web)', () => {
    const noBounds = { BoundsNELat: null, BoundsNELon: null, BoundsSWLat: null, BoundsSWLon: null };
    const site = { kind: 'custom' as const, data: { ...SITE_PLAN_DETAIL, Layers: SITE_PLAN_DETAIL.Layers.map((layer) => ({ ...layer, ...noBounds })) } };
    const layers = resolveFacilityLayers('custom:site', site, null);
    expect(layers.map((entry) => (entry.kind === 'custom' ? entry.layer.IndoorMapFloorId : ''))).toEqual(['site-base', 'site-evac']);
    expect(facilityBounds(layers)).toEqual({ ne: [-106.49, 35.01], sw: [-106.5, 35.0] });

    const building = { kind: 'indoor' as const, data: { ...BUILDING_A_DETAIL, Floors: BUILDING_A_DETAIL.Floors.map((floor) => ({ ...floor, ...noBounds })) } };
    expect(facilityLevels(building).map((level) => level.id)).toEqual(['floor-1', 'floor-2']);
    const [ground] = resolveFacilityLayers('indoor:bldg-a', building, null, { 'floor-1': { ...GROUND_FLOOR, ...noBounds } });
    expect(ground?.kind === 'indoor' ? [ground.floor.BoundsNELat, ground.floor.BoundsSWLon, ground.floor.Zones.length] : null).toEqual([35.01, -106.5, 1]);
  });

  it('takes a custom map layer’s regions from its own read (GetCustomMap lists layers without them)', () => {
    const listed = { kind: 'custom' as const, data: { ...SITE_PLAN_DETAIL, Layers: SITE_PLAN_DETAIL.Layers.map((layer) => ({ ...layer, Regions: [] })) } };
    const [base] = resolveFacilityLayers('custom:site', listed, 'site-base', {}, { 'site-base': BASE_LAYER });
    expect(base?.kind === 'custom' ? base.layer.Regions.map((region) => region.Name) : null).toEqual(['Tank yard']);
  });

  it('frames the drawn layers, else the map', () => {
    const layers = resolveFacilityLayers('custom:site', custom, null);
    expect(facilityBounds(layers)).toEqual({ ne: [-106.49, 35.01], sw: [-106.5, 35.0] });
    const fallback: FacilityBounds = { ne: [1, 2], sw: [0, 1] };
    expect(facilityBounds([], fallback)).toBe(fallback);
  });
});

describe('facilityFeatureOf', () => {
  it('finds a room with its map, floor and centre', () => {
    const layers = resolveFacilityLayers('indoor:bldg-a', indoor, null, { 'floor-1': GROUND_FLOOR });
    expect(facilityFeatureOf(layers, 'control')).toEqual({
      kind: 'indoor',
      mapId: 'bldg-a',
      mapName: 'Building A',
      levelId: 'floor-1',
      levelName: 'Ground floor',
      featureId: 'control',
      name: 'Control room',
      description: '',
      center: [-106.494, 35.006],
    });
    expect(facilityFeatureOf(layers, 'nope')).toBeNull();
  });

  it('takes the middle of the outline when the saved centre is missing', () => {
    const outline = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [-106.5, 35.0],
          [-106.49, 35.0],
          [-106.49, 35.01],
          [-106.5, 35.0],
        ],
      ],
    });

    expectNear(geometryCenter(outline), [-106.495, 35.005]);
    expect(geometryCenter('not json')).toBeNull();
    const floor = { ...GROUND_FLOOR, Zones: [{ ...CONTROL, CenterLatitude: 0, CenterLongitude: 0, GeoGeometry: outline }] };
    const [layer] = resolveFacilityLayers('indoor:bldg-a', indoor, null, { 'floor-1': floor });
    expectNear(facilityFeatureOf(layer ? [layer] : [], 'control')?.center, [-106.495, 35.005]);
  });
});

describe('lockedViewBounds', () => {
  it('keeps a margin around framed bounds and about two screens around a fixed spot', () => {
    const framed = lockedViewBounds({ bounds: { ne: [-106.49, 35.01], sw: [-106.5, 35.0] } });
    expectNear(framed.ne, [-106.485, 35.015]);
    expectNear(framed.sw, [-106.505, 34.995]);
    const fixed = lockedViewBounds({ center: [-106.5, 35], zoom: 16 });
    expect(fixed.sw[0]).toBeLessThan(-106.5);
    expect(fixed.ne[0]).toBeGreaterThan(-106.5);
    expect(fixed.ne[0] - fixed.sw[0]).toBeLessThan(0.1);
  });
});

describe('useMapViewStore facility maps', () => {
  beforeEach(() => useMapViewStore.getState().reset());

  it('switches a map on at its default level, keeps a chosen level and switches it off again', () => {
    const store = useMapViewStore.getState();
    store.toggleFacilityMap('indoor:bldg-a');
    expect(useMapViewStore.getState().facilityMaps).toEqual({ 'indoor:bldg-a': null });
    store.setFacilityLevel('indoor:bldg-a', 'floor-2');
    store.setFacilityLevel('custom:site', null);
    expect(useMapViewStore.getState().facilityMaps).toEqual({ 'indoor:bldg-a': 'floor-2', 'custom:site': null });
    store.toggleFacilityMap('indoor:bldg-a');
    expect(useMapViewStore.getState().facilityMaps).toEqual({ 'custom:site': null });
    store.reset();
    expect(useMapViewStore.getState().facilityMaps).toEqual({});
  });
});
