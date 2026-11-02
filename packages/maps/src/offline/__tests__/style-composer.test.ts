import { styleImageSourceUrl } from '../../lib/offline-style-sources';
import type { StyleSpecification } from '../../types';
import { buildFallbackOfflineStyle, composeOfflineStyle, OFFLINE_COVERAGE_METADATA, OFFLINE_PIXEL_IMAGES_METADATA, withRemoteFallback } from '../style-composer';
import { type FloorCorners, OfflineMapPackKind, type OfflineMapPackRecord, type OfflineStyleInput } from '../types';

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

  it('draws Core’s z0–9 overview only below the z10+ cells, so it is not stretched under them', () => {
    const overview = pack('pack:overview', { minZoom: 0, maxZoom: 9 });
    const cell = pack('pack:cell', { minZoom: 10, maxZoom: 15 });
    const style = composeOfflineStyle(input({ template: template(), glyphsPath: 'file:///glyphs', basemapPacks: [overview, cell] })) as unknown as Json;
    const overviewIndex = Object.entries(style.sources as Json)
      .find(([, source]) => (source as Json).url === 'pmtiles://file:///data/offline/pack:overview.pmtiles')?.[0]
      .split('-')
      .pop();
    const cellIndex = overviewIndex === '0' ? '1' : '0';
    const layer = (id: string): Json => style.layers.find((candidate: Json) => candidate.id === id);
    expect(layer(`water::${overviewIndex}`).maxzoom).toBe(10);
    expect(layer(`labels::${overviewIndex}`).maxzoom).toBe(10);
    expect(layer(`water::${cellIndex}`).maxzoom).toBeUndefined();
    // Packs that overlap in zoom (cells of one area) draw at every zoom.
    const cells = composeOfflineStyle(input({ template: template(), basemapPacks: [cell, pack('pack:cell2', { minZoom: 10, maxZoom: 15 })] })) as unknown as Json;
    expect(cells.layers.filter((candidate: Json) => candidate.maxzoom !== undefined)).toEqual([]);
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
    expect(style.metadata).toBeUndefined();
  });

  it('lists pixel-only images (no corners) in the style metadata instead of adding image sources', () => {
    const corners: FloorCorners = [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const withMetadata = { ...(template() as unknown as Json), metadata: { 'maputnik:renderer': 'mlgljs', [OFFLINE_PIXEL_IMAGES_METADATA]: { stale: 'file:///old.png' } } } as unknown as StyleSpecification;
    const style = composeOfflineStyle(
      input({
        template: withMetadata,
        indoorFloors: [
          { floorId: 'pre plan', imagePath: 'file:///data/pre-plan.png', corners: null },
          { floorId: 'f1', imagePath: 'file:///data/f1.png', corners },
          { floorId: 'a-site', imagePath: 'opfs://resgrid-offline-maps/scope/files/site.jpg', corners: null },
        ],
      })
    ) as unknown as Json;

    expect(style.sources['offline-floor-pre_plan']).toBeUndefined();
    expect(style.sources['offline-floor-a-site']).toBeUndefined();
    expect(style.layers.map((layer: Json) => layer.id).filter((id: string) => id.startsWith('offline-floor-'))).toEqual(['offline-floor-f1']);
    expect(style.sources['offline-floor-f1']).toEqual({ type: 'image', url: 'file:///data/f1.png', coordinates: corners });
    // The template's own metadata is kept; the pixel image list is the composer's.
    expect(style.metadata).toEqual({
      'maputnik:renderer': 'mlgljs',
      [OFFLINE_PIXEL_IMAGES_METADATA]: { 'offline-floor-a-site': 'opfs://resgrid-offline-maps/scope/files/site.jpg', 'offline-floor-pre_plan': 'file:///data/pre-plan.png' },
    });

    // Viewers find both kinds by the same source id.
    const composed = style as unknown as StyleSpecification;
    expect(styleImageSourceUrl(composed, 'offline-floor-pre_plan')).toBe('file:///data/pre-plan.png');
    expect(styleImageSourceUrl(composed, 'offline-floor-f1')).toBe('file:///data/f1.png');
    expect(styleImageSourceUrl(composed, 'offline-floor-missing')).toBeNull();
  });

  it('keeps the template metadata as it is when every floor has corners', () => {
    const withMetadata = { ...(template() as unknown as Json), metadata: { 'maputnik:renderer': 'mlgljs' } } as unknown as StyleSpecification;
    const style = composeOfflineStyle(input({ template: withMetadata })) as unknown as Json;
    expect(style.metadata).toEqual({ 'maputnik:renderer': 'mlgljs' });
  });
});

describe('withRemoteFallback', () => {
  const raster = { tileUrl: 'https://tiles.example.org/{z}/{x}/{y}.png', tileSize: 256, attribution: '© OpenStreetMap contributors' };
  const top = 85.051129;
  type Box = [number, number, number, number];
  type Remote = { bounds: Box; minzoom?: number; maxzoom?: number };

  const remoteOf = (style: Json): Remote[] =>
    style.layers
      .filter((layer: Json) => String(layer.id).startsWith('offline-remote-'))
      .map((layer: Json) => ({ bounds: style.sources[layer.source].bounds, ...(layer.minzoom !== undefined ? { minzoom: layer.minzoom } : {}), ...(layer.maxzoom !== undefined ? { maxzoom: layer.maxzoom } : {}) }));
  const inBox = ([west, south, east, north]: Box, [x, y]: [number, number]): boolean => west < x && x < east && south < y && y < north;
  const inZooms = (zoom: number, minZoom = 0, maxZoom: number | null = null): boolean => zoom >= minZoom && (maxZoom === null || zoom < maxZoom);

  /** Every sample point is drawn by exactly one of the local packs or the remote layers, at every zoom. */
  const expectDrawnOnce = (packs: OfflineMapPackRecord[], remote: Remote[], points: [number, number][]) => {
    const coverage = packs.map((p) => ({ bounds: p.bounds as Box, minZoom: p.minZoom, maxZoom: p.maxZoom < 15 ? p.maxZoom + 1 : null }));
    for (const zoom of [0, 5, 9.5, 10, 14, 18]) {
      for (const point of points) {
        const local = coverage.some((c) => inBox(c.bounds, point) && inZooms(zoom, c.minZoom, c.maxZoom));
        const remotes = remote.filter((r) => inBox(r.bounds, point) && inZooms(zoom, r.minzoom, r.maxzoom ?? null)).length;
        expect({ zoom, point, drawn: (local ? 1 : 0) + remotes }).toEqual({ zoom, point, drawn: 1 });
      }
    }
  };

  it('fills the gap between non-contiguous cells from the cells’ first zoom, and never where a pack draws', () => {
    // Core's z0–9 overview over the area and two z10+ cells with a gap between them (a split or L-shaped response area).
    const packs = [
      pack('pack:overview', { minZoom: 0, maxZoom: 9, bounds: [0, 0, 3, 1] }),
      pack('pack:cell-w', { minZoom: 10, maxZoom: 15, bounds: [0, 0, 1, 1] }),
      pack('pack:cell-e', { minZoom: 10, maxZoom: 15, bounds: [2, 0, 3, 1] }),
    ];
    const style = composeOfflineStyle(input({ basemapPacks: packs })) as StyleSpecification;
    expect((style as unknown as Json).metadata[OFFLINE_COVERAGE_METADATA]).toEqual([
      { bounds: [2, 0, 3, 1], minZoom: 10, maxZoom: null },
      { bounds: [0, 0, 1, 1], minZoom: 10, maxZoom: null },
      { bounds: [0, 0, 3, 1], minZoom: 0, maxZoom: 10 },
    ]);

    const remote = remoteOf(withRemoteFallback(style, raster) as unknown as Json);
    expect(remote).toEqual([{ bounds: [-180, -top, 0, top] }, { bounds: [3, -top, 180, top] }, { bounds: [0, -top, 3, 0] }, { bounds: [0, 1, 3, top] }, { bounds: [1, 0, 2, 1], minzoom: 10 }]);
    expectDrawnOnce(packs, remote, [
      [0.5, 0.5],
      [1.5, 0.5],
      [2.5, 0.5],
      [-20, 0.5],
      [40, 0.5],
      [1.5, -10],
      [1.5, 10],
    ]);
  });

  it('covers an L-shaped area’s missing corner and the strip of cells beyond the overview', () => {
    const packs = [
      pack('pack:overview', { minZoom: 0, maxZoom: 9, bounds: [0, 0, 2, 2] }),
      pack('pack:cell-1', { minZoom: 10, maxZoom: 15, bounds: [0, 0, 1, 1] }),
      pack('pack:cell-2', { minZoom: 10, maxZoom: 15, bounds: [1, 0, 2, 1] }),
      pack('pack:cell-3', { minZoom: 10, maxZoom: 15, bounds: [0, 1, 1, 2] }),
      // A cell reaching past the overview: below z10 nothing local draws there.
      pack('pack:cell-4', { minZoom: 10, maxZoom: 15, bounds: [2, 0, 2.5, 1] }),
    ];
    const remote = remoteOf(withRemoteFallback(composeOfflineStyle(input({ basemapPacks: packs })) as StyleSpecification, raster) as unknown as Json);
    // From z10 the missing corner and the part of the far strip no cell covers; below z10 the far strip.
    expect(remote).toContainEqual({ bounds: [1, 1, 2.5, 2], minzoom: 10 });
    expect(remote).toContainEqual({ bounds: [2, 0, 2.5, 2], maxzoom: 10 });
    expectDrawnOnce(packs, remote, [
      [0.5, 0.5],
      [1.5, 0.5],
      [0.5, 1.5],
      [1.5, 1.5],
      [2.25, 0.5],
      [2.25, 1.5],
      [3, 1],
      [-1, 1],
      [1, 3],
      [1, -1],
    ]);
  });

  it('adds nothing when the local map draws everywhere, or when the coverage is unknown', () => {
    const world = composeOfflineStyle(input({ basemapPacks: [pack('pack:world', { bounds: [-180, -90, 180, 90] })] })) as StyleSpecification;
    expect(withRemoteFallback(world, raster)).toBe(world);
    const unknown = composeOfflineStyle(input()) as StyleSpecification;
    expect(withRemoteFallback(unknown, raster)).toBe(unknown);
  });
});
