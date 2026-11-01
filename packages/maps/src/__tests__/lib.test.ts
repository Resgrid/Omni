import type { MapMakerInfoData, PoiResultData } from '@resgrid/models';

import { computeBounds, createCirclePolygon, normalizeHeading, zoomForSpeed } from '../lib/camera';
import { boundsToImageCoordinates, buildCustomMapTileUrlTemplate, buildIndoorFloorImageUrl, indoorZonesToFeatureCollection, resolveCustomMapLayerRendering } from '../lib/custom-maps';
import { buildPinCollection, resolvePinIcon } from '../lib/pin-features';
import { getPinEntityId, isPersonnelPin, isPinForCall, MapPinType } from '../lib/pin-ids';
import { filterAndSortPois, groupPoisByType, isPoiMarker, poisToFeatureCollection } from '../lib/poi';
import { fillStaticMapTemplate } from '../lib/static-map';
import { noopOfflinePackRegistry, noopOfflineStyleComposer, OfflineMapPackKind, OfflineMapPackStatus } from '../offline';
import { resolveMapCenter } from '../provider/map-center';
import { isSafeMapUrl } from '../provider/url-safety';
import { isJumpMode, paddingFromArgument, toCameraTarget, toNamedAnchor } from '../rg/camera-utils';
import { camelToKebab, toPaintAndLayout } from '../rg/style-props';

const pin = (overrides: Partial<MapMakerInfoData>): MapMakerInfoData => ({
  Id: 'c1',
  Longitude: 3.7,
  Latitude: 50.9,
  Title: 'Call 1',
  zIndex: 0,
  ImagePath: 'Call',
  InfoWindowContent: '',
  Color: '',
  Type: 0,
  PoiImage: '',
  ...overrides,
});

const poi = (overrides: Partial<PoiResultData>): PoiResultData => ({
  PoiId: 1,
  PoiTypeId: 1,
  PoiTypeName: 'Hydrant',
  Name: 'Alpha',
  Address: '',
  Note: '',
  Latitude: 50.9,
  Longitude: 3.7,
  Color: '#ff0000',
  ImagePath: '',
  Marker: '',
  IsDestination: false,
  ...overrides,
});

describe('custom map tiles and indoor images (signed URL builders)', () => {
  it('builds the custom map tile URL template with the z/x/y placeholders intact', () => {
    expect(buildCustomMapTileUrlTemplate('https://api.resgrid.com/api/v4/', 'layer 1')).toBe('https://api.resgrid.com/api/v4/Mapping/GetCustomMapTile/layer%201/{z}/{x}/{y}');
    const signed = buildCustomMapTileUrlTemplate('https://api.resgrid.com/api/v4', 'abc', (url) => `${url}?sig=xyz&exp=1`);
    expect(signed).toBe('https://api.resgrid.com/api/v4/Mapping/GetCustomMapTile/abc/{z}/{x}/{y}?sig=xyz&exp=1');
    expect(buildCustomMapTileUrlTemplate('', 'abc')).toBeNull();
    expect(buildIndoorFloorImageUrl('https://api.resgrid.com/api/v4', 'f1')).toBe('https://api.resgrid.com/api/v4/Mapping/GetIndoorMapFloorImage/f1');
  });

  it('turns NE/SW bounds into image corners and picks tiles vs image per layer', () => {
    const bounds = { BoundsNELat: 2, BoundsNELon: 4, BoundsSWLat: 1, BoundsSWLon: 3 };
    expect(boundsToImageCoordinates(bounds)).toEqual([
      [3, 2],
      [4, 2],
      [4, 1],
      [3, 1],
    ]);
    expect(boundsToImageCoordinates({ ...bounds, BoundsNELat: null })).toBeNull();
    const base = { ...bounds, IndoorMapFloorId: 'L1', HasImage: true, TileMinZoom: 12, TileMaxZoom: 19, Opacity: 0.6 };
    expect(resolveCustomMapLayerRendering({ ...base, IsTiled: true }, 'https://api.example.org/api/v4')).toEqual({
      kind: 'tiles',
      tileUrlTemplate: 'https://api.example.org/api/v4/Mapping/GetCustomMapTile/L1/{z}/{x}/{y}',
      minZoom: 12,
      maxZoom: 19,
      opacity: 0.6,
    });
    expect(resolveCustomMapLayerRendering({ ...base, IsTiled: false }, 'https://api.example.org/api/v4')).toMatchObject({ kind: 'image', url: 'https://api.example.org/api/v4/Mapping/GetCustomMapLayerImage/L1' });
    expect(resolveCustomMapLayerRendering({ ...base, IsTiled: false, HasImage: false }, 'https://api.example.org/api/v4')).toEqual({ kind: 'none' });
  });

  it('parses indoor zones and skips malformed geometry', () => {
    const zone = { IndoorMapFloorId: 'f', Description: null, ZoneType: 0, PixelGeometry: null, CenterPixelX: 0, CenterPixelY: 0, CenterLatitude: 0, CenterLongitude: 0, Metadata: null, IsSearchable: true };
    const result = indoorZonesToFeatureCollection({
      Zones: [
        {
          ...zone,
          IndoorMapZoneId: 'a',
          Name: 'A',
          Color: null,
          GeoGeometry: JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          }),
        },
        { ...zone, IndoorMapZoneId: 'b', Name: 'B', Color: '#000', GeoGeometry: '{not json' },
      ],
    });
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties).toMatchObject({ zoneId: 'a', name: 'A', color: '#3b82f6' });
  });
});

describe('pins', () => {
  const icons = { call: 1, station: 2, flag: 3 };

  it('resolves the pin icon chain: upload > status pin > bundled > default', () => {
    expect(resolvePinIcon(pin({ IconUrl: 'https://x/u.png', PinIconUrl: 'https://x/p.png' }), icons)?.source).toBe('https://x/u.png');
    expect(resolvePinIcon(pin({ IconUrl: 'relative.png', PinIconUrl: 'https://x/p.png' }), icons)?.source).toBe('https://x/p.png');
    expect(resolvePinIcon(pin({ ImagePath: 'Station' }), icons)).toEqual({ name: 'pin-bundled-station', source: 2 });
    expect(resolvePinIcon(pin({ ImagePath: 'unknown', Type: MapPinType.Poi }), icons)).toEqual({ name: 'pin-bundled-flag', source: 3 });
    expect(resolvePinIcon(pin({ ImagePath: 'unknown' }), {})).toBeNull();
  });

  it('builds one feature per pin with deduplicated images, hides personnel without PII rights and excludes the selected pin', () => {
    const pins = [pin({ Id: 'c1' }), pin({ Id: 'c2' }), pin({ Id: 'p9', Type: MapPinType.Personnel, ImagePath: 'Person' }), pin({ Id: 'bad', Latitude: 0, Longitude: 0 })];
    const collection = buildPinCollection(pins, { icons, canViewPersonnel: false, selectedPinId: 'c2' });
    expect(collection.features.features.map((feature) => feature.properties.pinId)).toEqual(['c1']);
    expect(Object.keys(collection.images)).toEqual(['pin-bundled-call']);
    expect(collection.byId.has('c2')).toBe(true);
    expect(collection.byId.has('p9')).toBe(false);
    expect(buildPinCollection(pins, { icons, canViewPersonnel: true }).features.features).toHaveLength(3);
  });

  it('strips pin id prefixes and recognizes personnel / call pins', () => {
    expect(getPinEntityId({ Id: 'c123', Type: MapPinType.Call })).toBe('123');
    expect(getPinEntityId({ Id: 'cabc', Type: MapPinType.Call })).toBe('cabc');
    expect(getPinEntityId({ Id: 'p-guid', Type: MapPinType.Personnel })).toBe('-guid');
    expect(isPinForCall({ Id: 'c5', Type: 0 }, 5)).toBe(true);
    expect(isPersonnelPin({ Type: 1, ImagePath: 'Person_Available' })).toBe(true);
  });
});

describe('POIs', () => {
  it('detects POI markers like the web app', () => {
    expect(isPoiMarker({ Type: 4, PoiTypeId: null, LayerId: '', PoiImage: '', ImagePath: '' })).toBe(true);
    expect(isPoiMarker({ Type: 0, PoiTypeId: null, LayerId: 'poi-type-3', PoiImage: '', ImagePath: '' })).toBe(true);
    expect(isPoiMarker({ Type: 0, PoiTypeId: null, LayerId: '', PoiImage: '', ImagePath: 'map-icon-hospital' })).toBe(true);
    expect(isPoiMarker({ Type: 0, PoiTypeId: null, LayerId: '', PoiImage: '', ImagePath: 'Call' })).toBe(false);
  });

  it('filters, searches, sorts, groups and converts POIs', () => {
    const pois = [poi({ PoiId: 1, Name: 'Zulu', PoiTypeId: 2, PoiTypeName: 'Station' }), poi({ PoiId: 2, Name: 'Alpha', Address: '1 Main St' }), poi({ PoiId: 3, Name: 'Bravo', Latitude: 0, Longitude: 0 })];
    expect(filterAndSortPois(pois, { poiTypeId: 'all', sortBy: 'name', search: '' }).map((p) => p.PoiId)).toEqual([2, 3, 1]);
    expect(filterAndSortPois(pois, { poiTypeId: '2', sortBy: 'name', search: '' }).map((p) => p.PoiId)).toEqual([1]);
    expect(filterAndSortPois(pois, { poiTypeId: 'all', sortBy: 'name', search: 'main' }).map((p) => p.PoiId)).toEqual([2]);
    expect(filterAndSortPois(pois, { poiTypeId: 'all', sortBy: 'type', search: '' }).map((p) => p.PoiId)).toEqual([2, 3, 1]);
    expect(groupPoisByType(pois).map((group) => group.poiTypeName)).toEqual(['Hydrant', 'Station']);
    const shape = poisToFeatureCollection(pois, [{ PoiTypeId: 2, Name: 'Station', Color: '#00ff00', ImagePath: '', Marker: '', IsDestination: false, IconUrl: 'https://x/i.png' }]);
    expect(shape.features.map((feature) => feature.properties?.poiId)).toEqual([1, 2]);
    expect(shape.features[0].properties).toMatchObject({ icon: 'poi-type-2', color: '#ff0000' });
  });
});

describe('camera helpers', () => {
  it('computes bounds, detects single points and ignores invalid coordinates', () => {
    expect(computeBounds([[1, 2], [3, -1], [Number.NaN, 5], null])).toEqual({ ne: [3, 2], sw: [1, -1], single: null });
    expect(computeBounds([[4, 5]])).toEqual({ ne: [4, 5], sw: [4, 5], single: [4, 5] });
    expect(computeBounds([])).toBeNull();
  });

  it('keeps the follow-camera maths from Unit', () => {
    expect(zoomForSpeed(0)).toBe(17);
    expect(zoomForSpeed(100)).toBe(12.5);
    expect(normalizeHeading(-1)).toBeNull();
    expect(normalizeHeading(370)).toBe(10);
    const ring = createCirclePolygon(0, 0, 100, 8).geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('converts rnmapbox camera options', () => {
    expect(toCameraTarget({ bounds: { ne: [2, 2], sw: [1, 1], paddingTop: 10 }, zoomLevel: 5 })).toMatchObject({ bounds: [1, 1, 2, 2], zoom: undefined, padding: { top: 10, right: 40, bottom: 40, left: 40 } });
    expect(toCameraTarget({ centerCoordinate: [200, 1] }).center).toBeUndefined();
    expect(isJumpMode('none', 500)).toBe(true);
    expect(paddingFromArgument([1, 2, 3, 4])).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
    expect(toNamedAnchor({ x: 0, y: 0 })).toBe('top-left');
    expect(toNamedAnchor({ x: 0.5, y: 0.5 })).toBe('center');
    expect(toNamedAnchor('right')).toBe('right');
  });
});

describe('style props', () => {
  it('splits camelCase styles into spec paint and layout', () => {
    expect(camelToKebab('iconTextFitPadding')).toBe('icon-text-fit-padding');
    expect(toPaintAndLayout('symbol', { iconImage: 'pin', iconSize: 2, textColor: '#fff', textHaloWidth: 1, visibility: 'none', textTranslate: { x: 1, y: 2 }, textColorTransition: { duration: 1, delay: 0 } })).toEqual({
      layout: { 'icon-image': 'pin', 'icon-size': 2, visibility: 'none' },
      paint: { 'text-color': '#fff', 'text-halo-width': 1, 'text-translate': [1, 2], 'text-color-transition': { duration: 1, delay: 0 } },
    });
    expect(toPaintAndLayout('symbol', { iconImage: 12 }).layout).toEqual({});
  });
});

describe('static map template, centre and URL safety', () => {
  it('fills the server static map template', () => {
    expect(
      fillStaticMapTemplate('https://api.example.org/static?lat={lat}&lon={lon}&z={zoom}&w={width}&h={height}&s={scale}&style={scheme}&x={unknown}', {
        latitude: 50.9,
        longitude: 3.7,
        zoom: 15,
        width: 320.4,
        height: 200,
        scale: 3,
        scheme: 'dark',
      })
    ).toBe('https://api.example.org/static?lat=50.900000&lon=3.700000&z=15&w=320&h=200&s=2&style=night&x={unknown}');
    expect(fillStaticMapTemplate('http://insecure.example.org/{lat}', { latitude: 1, longitude: 1, zoom: 1, width: 1, height: 1, scale: 1, scheme: 'light' })).toBeNull();
  });

  it('resolves the department centre with the legacy guards', () => {
    expect(resolveMapCenter(0, 0, 10).latitude).toBeCloseTo(39.14, 1);
    expect(resolveMapCenter(51.5, 0, Number.POSITIVE_INFINITY)).toEqual({ latitude: 51.5, longitude: 0, zoomLevel: 9 });
  });

  it('accepts https and (in development) localhost http only', () => {
    expect(isSafeMapUrl('https://tiles.example.org/x', false)).toBe(true);
    expect(isSafeMapUrl('http://tiles.example.org/x', true)).toBe(false);
    expect(isSafeMapUrl('http://127.0.0.1:8080/x', true)).toBe(true);
    expect(isSafeMapUrl('http://127.0.0.1:8080/x', false)).toBe(false);
  });
});

describe('offline seams', () => {
  it('keeps the persisted pack enums and ships inert defaults', async () => {
    expect(OfflineMapPackKind.Sprite).toBe(5);
    expect(OfflineMapPackStatus.Failed).toBe(3);
    const scope = { serverUrl: 'https://api', departmentId: '1', userId: 'u' };
    await expect(noopOfflinePackRegistry.list(scope)).resolves.toEqual([]);
    await expect(noopOfflinePackRegistry.totalBytes(scope)).resolves.toBe(0);
    expect(noopOfflineStyleComposer.compose({ scheme: 'light', template: null, basemapPacks: [], customMapPacks: [], glyphsPath: null, spritePath: null, departmentData: null, indoorFloors: [] })).toBeNull();
  });
});
