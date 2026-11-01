import type { StyleSpecification } from '../../types';
import { buildFallbackOfflineStyle, composeOfflineStyle } from '../style-composer';
import { OfflineMapPackKind, type OfflineMapPackRecord, type OfflineStyleInput } from '../types';

type Json = Record<string, any>;

const pack = (packId: string, overrides: Partial<OfflineMapPackRecord> = {}): OfflineMapPackRecord => ({
  packId,
  kind: OfflineMapPackKind.Basemap,
  assetKind: 'basemap',
  key: packId,
  version: 'v1',
  sha256: 'x',
  bytes: 1,
  path: `file:///data/offline/${packId}.pmtiles`,
  bounds: null,
  minZoom: 0,
  maxZoom: 15,
  pinned: true,
  lastUsedAt: null,
  downloadedAt: 1,
  ...overrides,
});

const input = (overrides: Partial<OfflineStyleInput> = {}): OfflineStyleInput => ({
  scheme: 'light',
  template: null,
  basemapPacks: [pack('pack:a')],
  customMapPacks: [],
  glyphsPath: null,
  spritePath: null,
  departmentData: null,
  indoorFloors: [],
  ...overrides,
});

const template = (): StyleSpecification =>
  ({
    version: 8,
    glyphs: '{glyphs}/{fontstack}/{range}.pbf',
    sprite: '{sprite}',
    sources: { protomaps: { type: 'vector', url: '{basemap}' }, online: { type: 'raster', tiles: ['https://tiles.example.org/{z}/{x}/{y}.png'] } },
    layers: [
      { id: 'background', type: 'background' },
      { id: 'water', type: 'fill', source: 'protomaps', 'source-layer': 'water' },
      { id: 'labels', type: 'symbol', source: 'protomaps', 'source-layer': 'places', layout: { 'text-field': ['get', 'name'] } },
    ],
  }) as unknown as StyleSpecification;

describe('composeOfflineStyle', () => {
  it('returns null without base packs (stay online)', () => {
    expect(composeOfflineStyle(input({ basemapPacks: [] }))).toBeNull();
  });

  it('points the built-in Protomaps style at the local pack with attribution', () => {
    const style = composeOfflineStyle(input()) as unknown as Json;
    expect(style.sources.protomaps).toMatchObject({ type: 'vector', url: 'pmtiles://file:///data/offline/pack:a.pmtiles', attribution: 'Protomaps © OpenStreetMap', maxzoom: 15 });
    expect(style.layers.map((layer: Json) => layer.id)).toEqual((buildFallbackOfflineStyle('light') as unknown as Json).layers.map((layer: Json) => layer.id));
    expect(style.glyphs).toBeUndefined();
    expect(JSON.stringify(style)).not.toContain('{basemap}');
  });

  it('repeats base layers per cell with stable ids, whatever the pack order', () => {
    const first = composeOfflineStyle(input({ template: template(), basemapPacks: [pack('pack:b'), pack('pack:a')] })) as unknown as Json;
    const second = composeOfflineStyle(input({ template: template(), basemapPacks: [pack('pack:a'), pack('pack:b')] })) as unknown as Json;
    expect(first).toEqual(second);
    expect(Object.keys(first.sources).sort()).toEqual(['online', 'protomaps-0', 'protomaps-1']);
    expect(first.layers.map((layer: Json) => layer.id)).toEqual(['background', 'water::0', 'water::1']);
    expect(first.sources['protomaps-1'].url).toBe('pmtiles://file:///data/offline/pack:b.pmtiles');
  });

  it('uses local glyphs and sprite when present, dropping text layers when glyphs are missing', () => {
    const withGlyphs = composeOfflineStyle(input({ template: template(), glyphsPath: 'file:///data/glyphs/', spritePath: 'file:///data/sprite/sprite' })) as unknown as Json;
    expect(withGlyphs.glyphs).toBe('file:///data/glyphs/{fontstack}/{range}.pbf');
    expect(withGlyphs.sprite).toBe('file:///data/sprite/sprite');
    expect(withGlyphs.layers.map((layer: Json) => layer.id)).toContain('labels');

    const withoutGlyphs = composeOfflineStyle(input({ template: template() })) as unknown as Json;
    expect(withoutGlyphs.glyphs).toBeUndefined();
    expect(withoutGlyphs.sprite).toBeUndefined();
    expect(withoutGlyphs.layers.map((layer: Json) => layer.id)).not.toContain('labels');
  });

  it('falls back to the built-in style for a template without the basemap placeholder', () => {
    const bad = { version: 8, sources: { other: { type: 'vector', url: 'https://x/tiles.json' } }, layers: [] } as unknown as StyleSpecification;
    const style = composeOfflineStyle(input({ template: bad })) as unknown as Json;
    expect(style.sources.protomaps.url).toBe('pmtiles://file:///data/offline/pack:a.pmtiles');
    expect(style.sources.other).toBeUndefined();
  });

  it('adds custom maps and indoor floors as hidden layers and department data as sources', () => {
    const style = composeOfflineStyle(
      input({
        customMapPacks: [pack('pack:c', { assetKind: 'custom-map', kind: OfflineMapPackKind.CustomMapRaster, customMapLayerId: 'layer 9', path: 'file:///data/c.pmtiles' })],
        indoorFloors: [
          {
            floorId: 'f1',
            imagePath: 'file:///data/f1.png',
            corners: [
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          },
        ],
        departmentData: { pois: { type: 'FeatureCollection', features: [] } },
      })
    ) as unknown as Json;
    expect(style.sources['offline-custom-layer_9']).toEqual({ type: 'raster', url: 'pmtiles://file:///data/c.pmtiles', tileSize: 256, attribution: 'Protomaps © OpenStreetMap' });
    expect(style.layers.find((layer: Json) => layer.id === 'offline-custom-layer_9').layout).toEqual({ visibility: 'none' });
    expect(style.sources['offline-floor-f1']).toMatchObject({ type: 'image', url: 'file:///data/f1.png' });
    expect(style.sources['offline-dept-pois']).toMatchObject({ type: 'geojson' });
  });
});
