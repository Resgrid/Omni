import './test-setup';

import type { MapMakerInfoData } from '@resgrid/models';

import { toFeatureCollection } from '../lib/layer-geojson';
import { departmentTarget, FOCUS_ZOOM, OWN_LOCATION_ZOOM, resolveHomeTarget } from '../lib/map-camera';
import { buildHighlightCollection, filterMarkers, findEntityPin, findFocusPin, highlightTargets, markerKindOf, parseMapFocus, poiTypeLayers, presentMarkerKinds } from '../lib/map-markers';
import { MAP_ROUTE_PATTERNS, mapRoutes } from '../routes';
import { pin } from './fixtures';

const PINS = [
  pin('c12', 0, { Title: 'Structure fire' }),
  pin('u7', 1, { Title: 'Engine 7' }),
  pin('s1', 2, { Title: 'Station 1' }),
  pin('pAB12-CD', 3, { Title: 'Pat Doe' }),
  pin('poi5', 4, { PoiTypeId: 9, PoiTypeName: 'Hydrants dry', Color: '#ff0000' }),
  pin('poi6', 4, { PoiTypeId: 3, PoiTypeName: 'Airports', Color: '#00ff00' }),
  pin('poi7', 4, { PoiTypeId: 9, PoiTypeName: 'Hydrants dry', Color: '#ff0000' }),
  pin('hydrant-1', 5),
  // An older server marks a person only by the image name.
  pin('legacy', 1, { ImagePath: 'Person_Available' }),
];

describe('marker building', () => {
  it('classifies pins by kind, treating image-only people as personnel', () => {
    expect(PINS.map(markerKindOf)).toEqual(['call', 'unit', 'station', 'personnel', 'poi', 'poi', 'poi', 'hydrant', 'personnel']);
    expect(markerKindOf(pin('x', 9))).toBe('other');
  });

  it('lists the kinds present, hiding personnel without CanViewPII', () => {
    expect(presentMarkerKinds(PINS, true)).toEqual(['call', 'unit', 'personnel', 'station', 'poi', 'hydrant']);
    expect(presentMarkerKinds(PINS, false)).toEqual(['call', 'unit', 'station', 'poi', 'hydrant']);
  });

  it('derives one layer per POI type, sorted by name', () => {
    expect(poiTypeLayers(PINS)).toEqual([
      { id: 'poi:3', poiTypeId: 3, name: 'Airports', color: '#00ff00' },
      { id: 'poi:9', poiTypeId: 9, name: 'Hydrants dry', color: '#ff0000' },
    ]);
  });

  it('filters by kind, POI type and the personal-data right', () => {
    const ids = (pins: MapMakerInfoData[]) => pins.map((entry) => entry.Id);
    expect(ids(filterMarkers(PINS, { hiddenKinds: {}, hiddenPoiTypes: {}, canViewPersonnel: true }))).toHaveLength(PINS.length);
    expect(ids(filterMarkers(PINS, { hiddenKinds: {}, hiddenPoiTypes: {}, canViewPersonnel: false }))).not.toEqual(expect.arrayContaining(['pAB12-CD', 'legacy']));
    expect(ids(filterMarkers(PINS, { hiddenKinds: { unit: true, hydrant: true }, hiddenPoiTypes: { 'poi:9': true }, canViewPersonnel: true }))).toEqual(['c12', 's1', 'pAB12-CD', 'poi6', 'legacy']);
  });
});

describe('focus', () => {
  it('parses the first usable focus parameter and rejects unsafe ids', () => {
    expect(parseMapFocus({ callId: '12' })).toEqual({ kind: 'call', id: '12' });
    expect(parseMapFocus({ unitId: ['7', '8'] })).toEqual({ kind: 'unit', id: '7' });
    expect(parseMapFocus({ userId: 'AB12-CD', poiId: '5' })).toEqual({ kind: 'personnel', id: 'AB12-CD' });
    expect(parseMapFocus({ callId: '../settings', poiId: '5' })).toEqual({ kind: 'poi', id: '5' });
    expect(parseMapFocus({ poiId: '-1' })).toBeNull();
    expect(parseMapFocus({})).toBeNull();
  });

  it('finds the focused pin by entity id (people case-insensitively)', () => {
    expect(findFocusPin(PINS, { kind: 'call', id: '12' })?.Title).toBe('Structure fire');
    expect(findFocusPin(PINS, { kind: 'personnel', id: 'ab12-cd' })?.Title).toBe('Pat Doe');
    expect(findFocusPin(PINS, { kind: 'poi', id: '6' })?.Id).toBe('poi6');
    expect(findFocusPin(PINS, { kind: 'unit', id: '12' })).toBeNull();
    expect(findEntityPin(PINS, 'call', null)).toBeNull();
  });
});

describe('active unit and call halos', () => {
  it('haloes the active call and, where given, the active unit', () => {
    const targets = highlightTargets(PINS, { activeCallId: '12', activeUnitId: '7' });
    expect(targets.map((target) => [target.role, target.pin.Id])).toEqual([
      ['activeCall', 'c12'],
      ['activeUnit', 'u7'],
    ]);
    expect(highlightTargets(PINS, { activeCallId: '99', activeUnitId: null })).toEqual([]);
    const collection = buildHighlightCollection(targets, { activeCall: '#dc2626', activeUnit: '#3b82f6' });
    expect(collection.features.map((feature) => feature.properties)).toEqual([
      { role: 'activeCall', color: '#dc2626' },
      { role: 'activeUnit', color: '#3b82f6' },
    ]);
    expect(collection.features[0]?.geometry.coordinates).toEqual([-119.8, 39.5]);
  });
});

describe('layer GeoJSON', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  };

  it('normalizes collections, features, geometries and JSON strings', () => {
    expect(
      toFeatureCollection({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: polygon, properties: { name: 'Zone' } },
          { type: 'Feature', geometry: null },
        ],
      })?.features
    ).toHaveLength(1);
    expect(toFeatureCollection({ type: 'Feature', geometry: polygon, properties: null })?.features[0]?.properties).toEqual({});
    expect(toFeatureCollection(polygon)?.features).toHaveLength(1);
    expect(toFeatureCollection(JSON.stringify({ type: 'FeatureCollection', features: [] }))).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('returns null for anything that is not GeoJSON', () => {
    expect(toFeatureCollection(undefined)).toBeNull();
    expect(toFeatureCollection('not json')).toBeNull();
    expect(toFeatureCollection({ type: 'Polygon' })).toBeNull();
    expect(toFeatureCollection([1, 2])).toBeNull();
  });
});

describe('camera targets', () => {
  const fallback = { latitude: 39.1, longitude: -119.7, zoomLevel: 9 };
  const department = departmentTarget({ centerLatitude: 40, centerLongitude: -105, zoomLevel: 12 }, fallback);

  it('uses the map data centre, else the provider centre', () => {
    expect(department).toEqual({ centerCoordinate: [-105, 40], zoomLevel: 12 });
    expect(departmentTarget({ centerLatitude: 0, centerLongitude: 0, zoomLevel: null }, fallback)).toEqual({ centerCoordinate: [-119.7, 39.1], zoomLevel: 9 });
  });

  it('frames the focus, then the device (field apps), then the department', () => {
    expect(resolveHomeTarget({ focusPin: { Latitude: 41, Longitude: -104 }, ownLocation: { latitude: 1, longitude: 1 }, preferOwnLocation: true, department })).toEqual({
      target: { centerCoordinate: [-104, 41], zoomLevel: FOCUS_ZOOM },
      reason: 'focus',
    });
    expect(resolveHomeTarget({ focusPin: null, ownLocation: { latitude: 38, longitude: -120 }, preferOwnLocation: true, department })).toEqual({
      target: { centerCoordinate: [-120, 38], zoomLevel: OWN_LOCATION_ZOOM },
      reason: 'own-location',
    });
    expect(resolveHomeTarget({ focusPin: null, ownLocation: { latitude: 38, longitude: -120 }, preferOwnLocation: false, department }).reason).toBe('department');
  });
});

describe('routes', () => {
  it('builds /map links with a safe focus parameter', () => {
    expect(MAP_ROUTE_PATTERNS.map).toBe('/map');
    expect(mapRoutes.map()).toBe('/map');
    expect(mapRoutes.focusCall(12)).toBe('/map?callId=12');
    expect(mapRoutes.focusUnit('7')).toBe('/map?unitId=7');
    expect(mapRoutes.focusPersonnel('ab 1')).toBe('/map?userId=ab%201');
    expect(mapRoutes.focusPoi(5)).toBe('/map?poiId=5');
    expect(() => mapRoutes.focusCall('../x')).toThrow();
    expect(() => mapRoutes.focusPoi(0)).toThrow();
  });
});
