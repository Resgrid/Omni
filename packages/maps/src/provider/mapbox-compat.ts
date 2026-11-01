import type { StyleSpecification } from '../types';

/**
 * MapLibre plan §8.3 — compatibility with servers that predate the MapLibre config fields. Those servers send a
 * `mapbox://styles/…` URL plus a public Mapbox token; MapLibre cannot resolve `mapbox://` URLs, so the client fetches
 * the style JSON once and rewrites every `mapbox://` style/source/sprite/glyph URL to `https://api.mapbox.com/...` with
 * the token (the same transform Core's `GetStyle` endpoint performs, D6). Mapbox-only style features MapLibre rejects
 * are stripped; the full inventory comes from spike P0-b, so the lists below are deliberately conservative.
 */

const MAPBOX_API = 'https://api.mapbox.com';

/** Public tokens only ("pk." + payload + signature); secret (sk.) tokens never qualify. */
const PUBLIC_TOKEN = /^pk\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+$/;

export const isPublicMapboxToken = (value: string | null | undefined): value is string => typeof value === 'string' && PUBLIC_TOKEN.test(value.trim());

const STYLE_URL = /^mapbox:\/\/styles\/([^/?#]+)\/([^/?#]+)\/?$/i;

/** `mapbox://styles/{owner}/{id}` (or the equivalent api.mapbox.com URL) → `{ owner, id }`. */
export const parseMapboxStyleUrl = (value: string | null | undefined): { owner: string; id: string } | null => {
  const url = typeof value === 'string' ? value.trim() : '';
  const match = STYLE_URL.exec(url) ?? /^https:\/\/api\.mapbox\.com\/styles\/v1\/([^/?#]+)\/([^/?#]+)\/?(\?.*)?$/i.exec(url);
  return match ? { owner: match[1], id: match[2] } : null;
};

const withToken = (url: string, token: string): string => {
  if (/[?&]access_token=/.test(url)) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
};

export type MapboxResourceKind = 'style' | 'source' | 'sprite' | 'glyphs' | 'tiles';

/**
 * Rewrites one `mapbox://` URL to its `https://api.mapbox.com` form with the token:
 * - style `mapbox://styles/u/id` → `/styles/v1/u/id`
 * - sprite `mapbox://sprites/u/id` → `/styles/v1/u/id/sprite` (MapLibre inserts `@2x` / `.json` before the query)
 * - glyphs `mapbox://fonts/u/{fontstack}/{range}.pbf` → `/fonts/v1/u/{fontstack}/{range}.pbf` (placeholders untouched)
 * - source `mapbox://mapbox.mapbox-streets-v8,…` → `/v4/mapbox.mapbox-streets-v8,….json?secure` (TileJSON)
 * - tiles `mapbox://tiles/…` → `/v4/…`
 * Already-https api.mapbox.com URLs only gain the token; anything else is returned unchanged.
 */
export const rewriteMapboxUrl = (url: string, token: string, kind: MapboxResourceKind): string => {
  const trimmed = url.trim();
  if (/^https:\/\/([a-z0-9-]+\.)*(api\.)?mapbox\.com\//i.test(trimmed)) {
    return withToken(trimmed, token);
  }
  if (!/^mapbox:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const rest = trimmed.replace(/^mapbox:\/\//i, '');
  switch (kind) {
    case 'style': {
      const parsed = parseMapboxStyleUrl(trimmed);
      return parsed ? withToken(`${MAPBOX_API}/styles/v1/${parsed.owner}/${parsed.id}`, token) : trimmed;
    }
    case 'sprite': {
      const path = rest.replace(/^sprites\//i, '');
      const [owner, id, ...extra] = path.split('/');
      const suffix = extra.length > 0 ? `/${extra.join('/')}` : '';
      return withToken(`${MAPBOX_API}/styles/v1/${owner}/${id}${suffix}/sprite`, token);
    }
    case 'glyphs':
      return withToken(`${MAPBOX_API}/fonts/v1/${rest.replace(/^fonts\//i, '')}`, token);
    case 'tiles':
      return withToken(`${MAPBOX_API}/v4/${rest.replace(/^tiles\//i, '')}`, token);
    case 'source':
    default:
      return withToken(`${MAPBOX_API}/v4/${rest}.json?secure`, token);
  }
};

/** Root keys of the MapLibre style spec; Mapbox-only roots (fog, imports, schema, lights, camera, models…) are dropped. */
const MAPLIBRE_ROOT_KEYS = new Set<string>([
  'version',
  'name',
  'metadata',
  'center',
  'centerAltitude',
  'zoom',
  'bearing',
  'pitch',
  'roll',
  'light',
  'sky',
  'sources',
  'sprite',
  'glyphs',
  'transition',
  'layers',
  'state',
  'font-faces',
]);

const MAPLIBRE_LAYER_TYPES = new Set<string>(['background', 'fill', 'line', 'symbol', 'circle', 'heatmap', 'fill-extrusion', 'raster', 'hillshade', 'color-relief']);

const MAPLIBRE_SOURCE_TYPES = new Set<string>(['vector', 'raster', 'raster-dem', 'geojson', 'image', 'video']);

/** Mapbox GL v2/v3 paint/layout properties MapLibre does not know (substring match). */
const MAPBOX_ONLY_PROPERTY_PARTS = [
  'emissive-strength',
  'z-offset',
  'z-elevate',
  'elevation-reference',
  'occlusion-opacity',
  'cross-fade',
  'use-theme',
  'ambient-occlusion',
  'flood-light',
  'rounded-roof',
  'edge-radius',
  'vertical-scale',
  'cutoff-fade-range',
  'line-trim-',
  'line-border-',
  'raster-color',
  'raster-array-band',
  'raster-elevation',
  'tunnel-structure',
  'clip-layer-',
];

const isMapboxOnlyProperty = (key: string): boolean => MAPBOX_ONLY_PROPERTY_PARTS.some((part) => key.includes(part));

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanProperties = (value: unknown): JsonObject | undefined => {
  if (!isObject(value)) {
    return undefined;
  }
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isMapboxOnlyProperty(key)) {
      result[key] = entry;
    }
  }
  return result;
};

const rewriteSource = (source: unknown, token: string, attribution: string): JsonObject | null => {
  if (!isObject(source) || typeof source.type !== 'string' || !MAPLIBRE_SOURCE_TYPES.has(source.type)) {
    return null;
  }
  const next: JsonObject = { ...source };
  if (typeof next.url === 'string') {
    next.url = rewriteMapboxUrl(next.url, token, 'source');
  }
  if (Array.isArray(next.tiles)) {
    next.tiles = next.tiles.map((tile) => (typeof tile === 'string' ? rewriteMapboxUrl(tile, token, 'tiles') : tile));
  }
  if (attribution && typeof next.attribution !== 'string' && next.type !== 'geojson') {
    next.attribution = attribution;
  }
  return next;
};

const rewriteSprite = (sprite: unknown, token: string): unknown => {
  if (typeof sprite === 'string') {
    return rewriteMapboxUrl(sprite, token, 'sprite');
  }
  if (Array.isArray(sprite)) {
    return sprite.map((entry) => (isObject(entry) && typeof entry.url === 'string' ? { ...entry, url: rewriteMapboxUrl(entry.url, token, 'sprite') } : entry));
  }
  return sprite;
};

/**
 * Turns a Mapbox style JSON into a MapLibre-usable one: every `mapbox://` URL rewritten with the token, Mapbox-only
 * roots, layer types, sources and properties removed, `slot` dropped, attribution injected into sources that lack it.
 */
export const transformMapboxStyle = (input: unknown, token: string, attribution: string): StyleSpecification => {
  if (!isObject(input)) {
    throw new Error('Mapbox style is not a JSON object');
  }
  const style: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (MAPLIBRE_ROOT_KEYS.has(key)) {
      style[key] = value;
    }
  }
  style.version = 8;

  const sources: JsonObject = {};
  if (isObject(input.sources)) {
    for (const [id, source] of Object.entries(input.sources)) {
      const rewritten = rewriteSource(source, token, attribution);
      if (rewritten) {
        sources[id] = rewritten;
      }
    }
  }
  style.sources = sources;

  if (style.sprite !== undefined) {
    style.sprite = rewriteSprite(style.sprite, token);
  }
  if (typeof style.glyphs === 'string') {
    style.glyphs = rewriteMapboxUrl(style.glyphs, token, 'glyphs');
  }

  const layers: JsonObject[] = [];
  if (Array.isArray(input.layers)) {
    for (const layer of input.layers) {
      if (!isObject(layer) || typeof layer.type !== 'string' || !MAPLIBRE_LAYER_TYPES.has(layer.type)) {
        continue;
      }
      if (typeof layer.source === 'string' && layer.type !== 'background' && !(layer.source in sources)) {
        continue;
      }
      const next: JsonObject = { ...layer };
      delete next.slot;
      const paint = cleanProperties(layer.paint);
      const layout = cleanProperties(layer.layout);
      if (paint) next.paint = paint;
      if (layout) next.layout = layout;
      layers.push(next);
    }
  }
  style.layers = layers;

  return style as unknown as StyleSpecification;
};

/** The style document URL to fetch for a Mapbox style (token included — never log it). */
export const mapboxStyleFetchUrl = (styleUrl: string, token: string): string | null => {
  const parsed = parseMapboxStyleUrl(styleUrl);
  return parsed ? rewriteMapboxUrl(`mapbox://styles/${parsed.owner}/${parsed.id}`, token, 'style') : null;
};
