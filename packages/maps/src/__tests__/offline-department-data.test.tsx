import type { CustomMapLayerResultData, IndoorMapFloorResultData } from '@resgrid/models';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Image } from 'react-native';

import { CustomMapRasterLayer, IndoorMapFloorLayer } from '../components/department-map-layers';
import { offlineDepartmentLayerIds, OfflineDepartmentLayers, offlineLayersFilter } from '../components/offline-department-layers';
import { PixelImageMap } from '../components/pixel-image-map';
import { offlineCustomMapSourceId, offlineDepartmentSourceId, offlineFloorSourceId, styleHasGlyphs, styleHasSource, styleImageSourceUrl } from '../lib/offline-style-sources';
import { createPixelFrame, hasGeoBounds, parsePixelRing, pixelRegionsToFeatureCollection } from '../lib/pixel-frame';
import type { MapOfflineOptions } from '../offline/types';
import { MapProvider } from '../provider/map-provider';
import type { MapServices } from '../provider/services';
import type { MapUrlSigner } from '../provider/url-signer';
import { MapView } from '../rg';
import type { StyleSpecification } from '../types';
import { resetMaplibreFakes } from './fakes/maplibre-react-native';

const API = 'https://api.example.org/api/v4';
const config = { MapLibreStyleUrlDay: 'https://maps.example.org/day.json' };

const offlineStyle = (withGlyphs = true): StyleSpecification =>
  ({
    version: 8,
    ...(withGlyphs ? { glyphs: 'file:///glyphs/{fontstack}/{range}.pbf' } : {}),
    sources: {
      protomaps: { type: 'vector', url: 'pmtiles://file:///cell.pmtiles' },
      [offlineCustomMapSourceId('L1')]: { type: 'raster', url: 'pmtiles://file:///custom-L1.pmtiles', tileSize: 256 },
      [offlineFloorSourceId('F1')]: { type: 'image', url: 'file:///floors/F1.png', coordinates: [] },
      [offlineDepartmentSourceId('layers')]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [],
  }) as unknown as StyleSpecification;

const offline = (style: StyleSpecification): MapOfflineOptions => ({ mode: 'offline', getStyle: () => style });

const sign = jest.fn(async (url: string) => ({ url: `${url}?sig=1`, refreshAt: Number.POSITIVE_INFINITY }));
const signer: MapUrlSigner = { sign, peek: () => null, clear: jest.fn() };
const services: Partial<MapServices> = { urlSigner: signer, getApiBaseUrl: () => API };

const layer = (overrides: Partial<CustomMapLayerResultData>): CustomMapLayerResultData => ({
  IndoorMapFloorId: 'L1',
  IndoorMapId: 'M1',
  Name: 'Fairground',
  FloorOrder: 0,
  LayerType: 0,
  HasImage: false,
  IsTiled: true,
  TileMinZoom: null,
  TileMaxZoom: null,
  BoundsNELat: 2,
  BoundsNELon: 4,
  BoundsSWLat: 1,
  BoundsSWLon: 3,
  Opacity: 0.6,
  MercatorTileUrl: `${API}/Mapping/GetCustomMapMercatorTile/L1/{z}/{x}/{y}`,
  Regions: [],
  ...overrides,
});

const floor: IndoorMapFloorResultData = {
  IndoorMapFloorId: 'F1',
  IndoorMapId: 'I1',
  Name: 'Level 1',
  FloorOrder: 1,
  HasImage: true,
  BoundsNELat: 2,
  BoundsNELon: 4,
  BoundsSWLat: 1,
  BoundsSWLon: 3,
  Opacity: 1,
  Zones: [],
};

beforeEach(() => {
  resetMaplibreFakes();
  sign.mockClear();
});

describe('offline style sources', () => {
  it('names and finds the composer’s sources, its glyphs and local floor images', () => {
    const style = offlineStyle();
    expect(offlineCustomMapSourceId('a b/c')).toBe('offline-custom-a_b_c');
    expect(styleHasSource(style, offlineFloorSourceId('F1'))).toBe(true);
    expect(styleHasSource(style, offlineFloorSourceId('F2'))).toBe(false);
    expect(styleHasSource('https://maps.example.org/day.json', 'protomaps')).toBe(false);
    expect(styleHasGlyphs(style)).toBe(true);
    expect(styleHasGlyphs(offlineStyle(false))).toBe(false);
    expect(styleImageSourceUrl(style, offlineFloorSourceId('F1'))).toBe('file:///floors/F1.png');
    expect(styleImageSourceUrl(style, offlineCustomMapSourceId('L1'))).toBeNull();
  });

  it('finds pixel-only images (no bounds) in the style metadata, the image source winning', () => {
    const withPixelImages = (pixelImages: unknown): StyleSpecification =>
      ({ ...(offlineStyle() as unknown as Record<string, unknown>), metadata: { 'resgrid:offline-pixel-images': pixelImages } }) as unknown as StyleSpecification;
    const style = withPixelImages({ [offlineFloorSourceId('P1')]: 'opfs://resgrid-offline-maps/scope/files/p1.png', [offlineFloorSourceId('F1')]: 'file:///other/F1.png' });
    expect(styleImageSourceUrl(style, offlineFloorSourceId('P1'))).toBe('opfs://resgrid-offline-maps/scope/files/p1.png');
    expect(styleImageSourceUrl(style, offlineFloorSourceId('F1'))).toBe('file:///floors/F1.png');
    expect(styleImageSourceUrl(style, offlineFloorSourceId('P2'))).toBeNull();

    // Anything but a non-empty string is no file.
    expect(styleImageSourceUrl(withPixelImages({ [offlineFloorSourceId('P1')]: 42 }), offlineFloorSourceId('P1'))).toBeNull();
    expect(styleImageSourceUrl(withPixelImages({ [offlineFloorSourceId('P1')]: '' }), offlineFloorSourceId('P1'))).toBeNull();
    expect(styleImageSourceUrl(withPixelImages({ [offlineFloorSourceId('P1')]: { url: 'file:///p1.png' } }), offlineFloorSourceId('P1'))).toBeNull();
    expect(styleImageSourceUrl(withPixelImages('file:///p1.png'), offlineFloorSourceId('P1'))).toBeNull();
    expect(styleImageSourceUrl(withPixelImages(null), offlineFloorSourceId('P1'))).toBeNull();
    expect(styleImageSourceUrl({ ...(offlineStyle() as unknown as Record<string, unknown>), metadata: 'none' } as unknown as StyleSpecification, offlineFloorSourceId('P1'))).toBeNull();
    expect(styleImageSourceUrl(null, offlineFloorSourceId('P1'))).toBeNull();
    expect(styleImageSourceUrl('https://maps.example.org/day.json', offlineFloorSourceId('P1'))).toBeNull();
  });
});

describe('custom maps and floors on the offline style', () => {
  it('draws a custom map from its downloaded pack and signs nothing', async () => {
    await render(
      <MapProvider config={config} colorScheme="light" services={services} offline={offline(offlineStyle())}>
        <MapView testID="map">
          <CustomMapRasterLayer layer={layer({})} />
        </MapView>
      </MapProvider>
    );
    const raster = screen.getByTestId('mlrn-layer-custom-map-L1-offline-layer');
    expect(raster.props.source).toBe('offline-custom-L1');
    expect(raster.props.paint).toMatchObject({ 'raster-opacity': 0.6 });
    expect(screen.queryByTestId('mlrn-raster-source-custom-map-L1-tiles')).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });

  it('draws an indoor floor from its downloaded image and falls back to the server online', async () => {
    const view = await render(
      <MapProvider config={config} colorScheme="light" services={services} offline={offline(offlineStyle())}>
        <MapView testID="map">
          <IndoorMapFloorLayer floor={floor} />
        </MapView>
      </MapProvider>
    );
    expect(screen.getByTestId('mlrn-layer-indoor-floor-F1-offline-layer').props.source).toBe('offline-floor-F1');
    await view.rerender(
      <MapProvider config={config} colorScheme="light" services={services}>
        <MapView testID="map">
          <IndoorMapFloorLayer floor={floor} />
        </MapView>
      </MapProvider>
    );
    expect(await screen.findByTestId('mlrn-image-source-indoor-floor-F1-image')).toBeTruthy();
    expect(sign).toHaveBeenCalledWith(`${API}/Mapping/GetIndoorMapFloorImage/F1`);
  });
});

describe('OfflineDepartmentLayers', () => {
  it('filters to the layers that are on, minus those drawn from online data, or the on-by-default ones', () => {
    expect(offlineLayersFilter(['a', 'b'], ['b'])).toEqual(['in', ['to-string', ['get', 'layerId']], ['literal', ['a']]]);
    expect(offlineLayersFilter(['b'], ['b'])).toBeNull();
    expect(offlineLayersFilter(null)).toEqual(['==', ['get', 'onByDefault'], true]);
    expect(offlineLayersFilter(null, ['x'])).toEqual(['all', ['==', ['get', 'onByDefault'], true], ['!', ['in', ['to-string', ['get', 'layerId']], ['literal', ['x']]]]]);
  });

  it('draws from the offline bundle source only on the offline style, with labels only when glyphs are installed', async () => {
    const view = await render(
      <MapProvider config={config} colorScheme="light" services={services} offline={offline(offlineStyle())}>
        <MapView testID="map">
          <OfflineDepartmentLayers visibleLayerIds={['l1']} />
        </MapView>
      </MapProvider>
    );
    expect(screen.getByTestId('mlrn-layer-offline-dept-layers-fill').props.source).toBe('offline-dept-layers');
    expect(screen.getByTestId('mlrn-layer-offline-dept-layers-labels')).toBeTruthy();
    // Drawn from the decoder's checked colour (never a raw `color` / `layerColor`), else the theme's.
    expect(screen.getByTestId('mlrn-layer-offline-dept-layers-fill').props.paint['fill-color']).toEqual(['coalesce', ['get', 'rgColor'], expect.any(String)]);
    expect(screen.getByTestId('mlrn-layer-offline-dept-layers-points').props.paint['circle-color']).toEqual(['coalesce', ['get', 'rgColor'], expect.any(String)]);
    // The ids a tap lookup queries are the layers drawn, topmost first.
    expect(offlineDepartmentLayerIds()).toEqual(['offline-dept-layers-labels', 'offline-dept-layers-points', 'offline-dept-layers-line', 'offline-dept-layers-fill']);

    for (const id of offlineDepartmentLayerIds()) expect(screen.getByTestId(`mlrn-layer-${id}`)).toBeTruthy();

    expect(offlineDepartmentLayerIds('map-screen-offline-layers')[0]).toBe('map-screen-offline-layers-labels');

    await view.rerender(
      <MapProvider config={config} colorScheme="light" services={services} offline={offline(offlineStyle(false))}>
        <MapView testID="map">
          <OfflineDepartmentLayers visibleLayerIds={['l1']} />
        </MapView>
      </MapProvider>
    );
    expect(screen.getByTestId('mlrn-layer-offline-dept-layers-line')).toBeTruthy();
    expect(screen.queryByTestId('mlrn-layer-offline-dept-layers-labels')).toBeNull();

    await view.rerender(
      <MapProvider config={config} colorScheme="light" services={services}>
        <MapView testID="map">
          <OfflineDepartmentLayers visibleLayerIds={['l1']} />
        </MapView>
      </MapProvider>
    );
    expect(screen.queryByTestId('mlrn-layer-offline-dept-layers-fill')).toBeNull();
  });
});

describe('pixel-space maps (D21)', () => {
  it('builds a frame with the image’s aspect ratio and maps the editor’s 0–1000 square onto it', () => {
    const frame = createPixelFrame(2000, 1000);
    const [west, south, east, north] = frame.bounds;
    expect(west).toBe(0);
    expect(south).toBe(0);
    expect(north / east).toBeCloseTo(0.5);
    expect(frame.corners[0]).toEqual([0, north]);
    expect(frame.toLngLat(1000, 1000)).toEqual([east, north]);
    expect(frame.toLngLat(500, 0)).toEqual([east / 2, 0]);
    expect(createPixelFrame(null, null).bounds[3]).toBeCloseTo(createPixelFrame(null, null).bounds[2]);
  });

  it('reads PixelGeometry rings (pairs or a pixel GeoJSON polygon) and closes them', () => {
    expect(parsePixelRing('[[0,0],[100,0],[100,100]]')).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    expect(
      parsePixelRing(
        JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 0],
            ],
          ],
        })
      )
    ).toHaveLength(4);
    expect(parsePixelRing('[[0,0],[1,1]]')).toBeNull();
    expect(parsePixelRing('not json')).toBeNull();
    const shapes = pixelRegionsToFeatureCollection(
      [
        { id: 'z1', name: 'Lobby', color: null, pixelGeometry: '[[0,0],[1000,0],[1000,1000]]' },
        { id: 'z2', name: 'Broken', color: '#f00', pixelGeometry: null },
      ],
      createPixelFrame(100, 100)
    );
    expect(shapes.features).toHaveLength(1);
    expect(shapes.features[0].geometry.coordinates[0]).toHaveLength(4);
    expect(shapes.features[0].properties).toMatchObject({ regionId: 'z1', color: '#3b82f6' });
  });

  it('tells georeferenced layers from pixel-only ones', () => {
    expect(hasGeoBounds({ BoundsNELat: 2, BoundsNELon: 4, BoundsSWLat: 1, BoundsSWLon: 3 })).toBe(true);
    expect(hasGeoBounds({ BoundsNELat: null, BoundsNELon: null, BoundsSWLat: null, BoundsSWLon: null })).toBe(false);
    expect(hasGeoBounds({ BoundsNELat: 0, BoundsNELon: 0, BoundsSWLat: 0, BoundsSWLon: 0 })).toBe(false);
  });

  it('draws a local image on a blank style without signing it', async () => {
    const getSize = jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => success?.(800, 400) as never);
    await render(
      <MapProvider config={config} colorScheme="light" services={services}>
        <PixelImageMap id="pixel-L2" imageUrl="file:///floors/L2.png" isLocalImage regions={[{ id: 'z1', name: 'Lobby', color: '#22c55e', pixelGeometry: '[[0,0],[500,0],[500,500]]' }]} />
      </MapProvider>
    );
    expect(sign).not.toHaveBeenCalled();
    expect(getSize).toHaveBeenCalledWith('file:///floors/L2.png', expect.any(Function), expect.any(Function));
    const image = await screen.findByTestId('mlrn-image-source-pixel-L2-image');
    // 800×400: the frame is half as tall as it is wide.
    const corners = image.props.coordinates as [number, number][];
    expect(corners[0][1] / corners[1][0]).toBeCloseTo(0.5);
    expect(screen.getByTestId('mlrn-source-pixel-L2-regions')).toBeTruthy();
    getSize.mockRestore();
  });
});
