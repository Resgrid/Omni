import type { StyleSpecification } from '../types';
import { OFFLINE_MAP_ATTRIBUTION, OfflineMapPackKind, type OfflineMapPackRecord, type OfflineStyleComposer, type OfflineStyleInput, type PackBounds } from './types';

/**
 * Offline style composer (MapLibre plan §19.5). Builds the style MapLibre Native draws from local packs:
 * - the base map from the server's offline style template (`{basemap}` vector source; Protomaps v4 schema), else a
 *   built-in minimal Protomaps style, with one `pmtiles://file://…` source per downloaded cell (layers repeated per cell);
 * - `{glyphs}` / `{sprite}` replaced by local paths, or removed (text layers too) when they are not on the device;
 * - custom map rasters and indoor floors as hidden layers (`offline-custom-<layer>`, `offline-floor-<floor>`) that map
 *   screens toggle; department GeoJSON as `offline-dept-<section>` sources;
 * - "Protomaps © OpenStreetMap" attribution on every offline source.
 * Pure and deterministic (same packs → same layer ids), so a recompose does not churn the map.
 */

type Json = Record<string, unknown>;

export const BASEMAP_PLACEHOLDER = '{basemap}';
export const GLYPHS_PLACEHOLDER = '{glyphs}';
export const SPRITE_PLACEHOLDER = '{sprite}';
export const OFFLINE_CUSTOM_MAP_PREFIX = 'offline-custom-';
export const OFFLINE_FLOOR_PREFIX = 'offline-floor-';
/** Style `metadata` key: pixel-only images (no bounds) by their `offline-floor-<id>` name → local file. */
export const OFFLINE_PIXEL_IMAGES_METADATA = 'resgrid:offline-pixel-images';
export const OFFLINE_DEPARTMENT_SOURCE_PREFIX = 'offline-dept-';
/** Style `metadata` key: `[west, south, east, north]` around the downloaded response area (base-map cells and overview). */
export const OFFLINE_COVERAGE_METADATA = 'resgrid:offline-coverage';
/** Sources and layers of the online fallback around the downloaded area (local-preferred mode). */
export const OFFLINE_REMOTE_FALLBACK_PREFIX = 'offline-remote-';

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
/** The id part the composer uses for offline source and layer ids (custom maps, floors, department sections). */
export const offlineSafeId = (value: string): string => value.replace(/[^A-Za-z0-9_-]+/g, '_');
const safeId = offlineSafeId;

/** `pmtiles://` + the local URI (`file://…` on iOS/Android, `opfs://…` on the web and Electron). */
export const pmtilesUrlFor = (path: string): string => `pmtiles://${path}`;

const PALETTE = {
  light: { background: '#f2efe9', earth: '#f2efe9', park: '#d8e8c8', water: '#a4c8e1', building: '#e0dcd6', roadMajor: '#ffffff', roadMinor: '#ffffff', roadCasing: '#cfc8bd', boundary: '#9e9cab' },
  dark: { background: '#1f2328', earth: '#22272e', park: '#253128', water: '#1b3349', building: '#2d333b', roadMajor: '#545d68', roadMinor: '#3a414a', roadCasing: '#1f2328', boundary: '#6e7681' },
} as const;

/**
 * Minimal Protomaps v4 base style (no labels, so no glyphs needed): land, parks, water, buildings, roads, boundaries.
 * Used when the manifest has no offline style template.
 */
export function buildFallbackOfflineStyle(scheme: 'light' | 'dark'): StyleSpecification {
  const c = PALETTE[scheme];
  const source = 'protomaps';
  const width = (base: number): unknown => ['interpolate', ['exponential', 1.6], ['zoom'], 5, base * 0.2, 12, base, 16, base * 6];
  return {
    version: 8,
    name: `resgrid-offline-${scheme}`,
    sources: { [source]: { type: 'vector', url: BASEMAP_PLACEHOLDER } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.background } },
      { id: 'earth', type: 'fill', source, 'source-layer': 'earth', paint: { 'fill-color': c.earth } },
      { id: 'landuse-park', type: 'fill', source, 'source-layer': 'landuse', filter: ['in', ['get', 'kind'], ['literal', ['park', 'forest', 'wood', 'nature_reserve', 'grass']]], paint: { 'fill-color': c.park } },
      { id: 'water', type: 'fill', source, 'source-layer': 'water', paint: { 'fill-color': c.water } },
      { id: 'buildings', type: 'fill', source, 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': c.building } },
      { id: 'roads-casing', type: 'line', source, 'source-layer': 'roads', filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]], paint: { 'line-color': c.roadCasing, 'line-width': width(3) } },
      {
        id: 'roads-minor',
        type: 'line',
        source,
        'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['minor_road', 'other', 'path']]],
        minzoom: 11,
        paint: { 'line-color': c.roadMinor, 'line-width': width(1) },
      },
      { id: 'roads-major', type: 'line', source, 'source-layer': 'roads', filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]], paint: { 'line-color': c.roadMajor, 'line-width': width(2) } },
      { id: 'boundaries', type: 'line', source, 'source-layer': 'boundaries', paint: { 'line-color': c.boundary, 'line-width': 1, 'line-dasharray': [3, 2] } },
    ],
  } as unknown as StyleSpecification;
}

const mentionsBasemap = (source: Json): boolean => {
  const url = typeof source.url === 'string' ? source.url : '';
  const tiles = Array.isArray(source.tiles) ? source.tiles.filter((tile): tile is string => typeof tile === 'string') : [];
  return url.includes(BASEMAP_PLACEHOLDER) || tiles.some((tile) => tile.includes(BASEMAP_PLACEHOLDER));
};

const validTemplate = (template: unknown): template is Json => isObject(template) && template.version === 8 && isObject(template.sources) && Array.isArray(template.layers);

const sortedPacks = (packs: OfflineMapPackRecord[]): OfflineMapPackRecord[] => [...packs].sort((a, b) => a.packId.localeCompare(b.packId));

export function composeOfflineStyle(input: OfflineStyleInput): StyleSpecification | null {
  const packs = sortedPacks(input.basemapPacks);
  if (packs.length === 0) {
    return null;
  }
  const attribution = input.attribution ?? OFFLINE_MAP_ATTRIBUTION;
  let template: Json = validTemplate(input.template) ? (JSON.parse(JSON.stringify(input.template)) as Json) : (buildFallbackOfflineStyle(input.scheme) as unknown as Json);
  let templateSources = template.sources as Record<string, unknown>;
  let basemapIds = Object.entries(templateSources)
    .filter(([, source]) => isObject(source) && source.type === 'vector' && mentionsBasemap(source))
    .map(([id]) => id);
  if (basemapIds.length === 0) {
    // A template without the placeholder cannot be pointed at local packs: use the built-in style instead.
    template = buildFallbackOfflineStyle(input.scheme) as unknown as Json;
    templateSources = template.sources as Record<string, unknown>;
    basemapIds = ['protomaps'];
  }
  const basemapSet = new Set(basemapIds);

  const sources: Record<string, unknown> = {};
  for (const [id, source] of Object.entries(templateSources)) {
    if (!basemapSet.has(id)) sources[id] = source;
  }
  const single = packs.length === 1;
  const sourceIdFor = (baseId: string, index: number): string => (single ? baseId : `${baseId}-${index}`);
  for (const baseId of basemapIds) {
    const base = templateSources[baseId] as Json;
    packs.forEach((pack, index) => {
      const { tiles: _tiles, ...rest } = base;
      sources[sourceIdFor(baseId, index)] = { ...rest, type: 'vector', url: pmtilesUrlFor(pack.path), minzoom: pack.minZoom, maxzoom: pack.maxZoom, attribution };
    });
  }

  // A pack that ends where others begin (Core's z0–9 overview under the z10+ cells) draws only below their first zoom,
  // so MapLibre does not stretch it under the cells (doubled roads and labels).
  const handOffZoom = packs.map((pack) => {
    const next = packs.filter((other) => other.minZoom > pack.maxZoom).map((other) => other.minZoom);
    return next.length > 0 ? Math.min(...next) : null;
  });
  let layers: Json[] = [];
  for (const layer of template.layers as unknown[]) {
    if (!isObject(layer)) continue;
    const source = typeof layer.source === 'string' ? layer.source : null;
    if (source !== null && basemapSet.has(source)) {
      packs.forEach((_pack, index) => {
        const copy: Json = { ...layer, id: single ? layer.id : `${String(layer.id)}::${index}`, source: sourceIdFor(source, index) };
        const handOff = handOffZoom[index];
        if (handOff !== null) copy.maxzoom = typeof layer.maxzoom === 'number' ? Math.min(layer.maxzoom, handOff) : handOff;
        layers.push(copy);
      });
    } else {
      layers.push(layer);
    }
  }

  // Glyphs: local directory, a remote URL left as is (ambient cache), or none — then text layers must go.
  const glyphs = typeof template.glyphs === 'string' ? template.glyphs : null;
  let resolvedGlyphs: string | null = glyphs;
  if (glyphs !== null && glyphs.includes(GLYPHS_PLACEHOLDER)) {
    resolvedGlyphs = input.glyphsPath ? glyphs.replace(GLYPHS_PLACEHOLDER, input.glyphsPath.replace(/\/+$/, '')) : null;
  }
  if (resolvedGlyphs === null) {
    layers = layers.filter((layer) => !(isObject(layer.layout) && 'text-field' in layer.layout));
  }

  const sprite = typeof template.sprite === 'string' ? template.sprite : null;
  let resolvedSprite: string | null = sprite;
  if (sprite !== null && sprite.includes(SPRITE_PLACEHOLDER)) {
    resolvedSprite = input.spritePath ? sprite.replace(SPRITE_PLACEHOLDER, input.spritePath) : null;
  } else if (sprite === null && input.spritePath) {
    resolvedSprite = input.spritePath;
  }

  for (const pack of sortedPacks(input.customMapPacks)) {
    const id = `${OFFLINE_CUSTOM_MAP_PREFIX}${safeId(pack.customMapLayerId ?? pack.packId)}`;
    sources[id] = { type: 'raster', url: pmtilesUrlFor(pack.path), tileSize: 256, attribution };
    layers.push({ id, type: 'raster', source: id, layout: { visibility: 'none' } });
  }
  const pixelImages: Record<string, string> = {};
  for (const floor of [...input.indoorFloors].sort((a, b) => a.floorId.localeCompare(b.floorId))) {
    const id = `${OFFLINE_FLOOR_PREFIX}${safeId(floor.floorId)}`;
    if (floor.corners) {
      sources[id] = { type: 'image', url: floor.imagePath, coordinates: floor.corners };
      layers.push({ id, type: 'raster', source: id, layout: { visibility: 'none' } });
    } else {
      // Pixel-only (no bounds): an image source needs coordinates, so the file is listed for the pixel-frame viewer.
      pixelImages[id] = floor.imagePath;
    }
  }
  for (const [section, data] of Object.entries(input.departmentData ?? {})) {
    sources[`${OFFLINE_DEPARTMENT_SOURCE_PREFIX}${safeId(section)}`] = { type: 'geojson', data, attribution };
  }

  const { glyphs: _glyphs, sprite: _sprite, ...rest } = template;
  const style: Json = { ...rest, sources, layers };
  const coverage = coverageOf(input.basemapPacks);
  const metadata: Json = {
    ...(Object.keys(pixelImages).length > 0 ? { [OFFLINE_PIXEL_IMAGES_METADATA]: pixelImages } : {}),
    ...(coverage ? { [OFFLINE_COVERAGE_METADATA]: coverage } : {}),
  };
  if (Object.keys(metadata).length > 0) style.metadata = { ...(isObject(template.metadata) ? template.metadata : {}), ...metadata };
  if (resolvedGlyphs !== null) style.glyphs = resolvedGlyphs;
  if (resolvedSprite !== null) style.sprite = resolvedSprite;
  return style as unknown as StyleSpecification;
}

/** The default composer (`OfflineStyleComposer` seam). */
export const offlineStyleComposer: OfflineStyleComposer = { compose: composeOfflineStyle };

/** Web Mercator's latitude limit (map source bounds must stay inside it). */
const MERCATOR_MAX_LATITUDE = 85.051129;

/** The box around the response-area base map (incident and corridor cells far away would stretch it, so they are left out). */
function coverageOf(packs: OfflineMapPackRecord[]): PackBounds | null {
  const boxes = packs.filter((pack) => pack.kind === OfflineMapPackKind.Basemap && pack.bounds).map((pack) => pack.bounds as PackBounds);
  if (boxes.length === 0) return null;
  const box: PackBounds = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
  return box.every(Number.isFinite) && box[0] < box[2] && box[1] < box[3] ? box : null;
}

/** The parts of the world outside a box, as up to four boxes (west, east, south, north). */
const outsideOf = ([west, south, east, north]: PackBounds): PackBounds[] => {
  const top = MERCATOR_MAX_LATITUDE;
  const candidates: PackBounds[] = [
    [-180, -top, west, top],
    [east, -top, 180, top],
    [west, -top, east, south],
    [west, north, east, top],
  ];
  return candidates.filter(([w, s, e, n]) => w < e && s < n);
};

/** An online raster tile source (the server's `MapRasterTileUrl`) to fill in around the downloaded area. */
export interface RemoteFallbackSource {
  tileUrl: string;
  tileSize: number;
  attribution: string;
}

const fallbackCache = new WeakMap<object, Map<string, StyleSpecification>>();

/**
 * Local-preferred mode (D16, online with the department's "use downloaded maps when online"): the local base map inside
 * the response area, the server's raster tiles around it. The raster sources are bounded to the bands outside the area,
 * so MapLibre requests no remote tile inside it (the setting exists to save mobile data); they sit under the local
 * layers, which cover the tiles on the edge. A style without a known coverage is returned as is. Cached per style and
 * URL, so the same input hands MapLibre the same object (no restyle).
 */
export function withRemoteFallback(style: StyleSpecification, fallback: RemoteFallbackSource): StyleSpecification {
  const source = style as unknown as Json;
  const metadata = isObject(source.metadata) ? source.metadata : null;
  const coverage = metadata && Array.isArray(metadata[OFFLINE_COVERAGE_METADATA]) ? (metadata[OFFLINE_COVERAGE_METADATA] as PackBounds) : null;
  if (!coverage || coverage.length !== 4) return style;
  const cached = fallbackCache.get(style)?.get(fallback.tileUrl);
  if (cached) return cached;

  const bands = outsideOf(coverage);
  const sources: Json = { ...(source.sources as Json) };
  const added: Json[] = bands.map((bounds, index) => {
    const id = `${OFFLINE_REMOTE_FALLBACK_PREFIX}${index}`;
    sources[id] = { type: 'raster', tiles: [fallback.tileUrl], tileSize: fallback.tileSize, bounds, attribution: fallback.attribution };
    return { id, type: 'raster', source: id };
  });
  const layers = (source.layers as Json[]) ?? [];
  // Above the background, under everything the local packs draw.
  let insertAt = 0;
  while (insertAt < layers.length && layers[insertAt].type === 'background') insertAt += 1;
  const result = { ...source, sources, layers: [...layers.slice(0, insertAt), ...added, ...layers.slice(insertAt)] } as unknown as StyleSpecification;

  const perStyle = fallbackCache.get(style) ?? new Map<string, StyleSpecification>();
  perStyle.set(fallback.tileUrl, result);
  fallbackCache.set(style, perStyle);
  return result;
}
