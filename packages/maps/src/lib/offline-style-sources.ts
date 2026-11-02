import { OFFLINE_CUSTOM_MAP_PREFIX, OFFLINE_DEPARTMENT_SOURCE_PREFIX, OFFLINE_FLOOR_PREFIX, OFFLINE_PIXEL_IMAGES_METADATA, offlineSafeId } from '../offline/style-composer';
import type { MapStyle } from '../types';

/**
 * What the composed offline style (MapLibre plan §19.5) carries besides the base map, so map screens can draw department
 * data from it while offline: raster PMTiles of custom maps (`offline-custom-<layer>`), indoor floor and single-image
 * custom map layers (`offline-floor-<id>`), and the department data sections as GeoJSON (`offline-dept-<section>`).
 * The composer adds the custom map and floor sources with hidden layers; screens add their own visible layer on top.
 * Pixel-only images (no bounds, D21) cannot be image sources; the style metadata lists their files under the same name.
 */

export const offlineCustomMapSourceId = (layerId: string): string => `${OFFLINE_CUSTOM_MAP_PREFIX}${offlineSafeId(layerId)}`;
export const offlineFloorSourceId = (floorOrLayerId: string): string => `${OFFLINE_FLOOR_PREFIX}${offlineSafeId(floorOrLayerId)}`;
export const offlineDepartmentSourceId = (section: string): string => `${OFFLINE_DEPARTMENT_SOURCE_PREFIX}${offlineSafeId(section)}`;

type StyleObject = { sources?: Record<string, unknown>; glyphs?: unknown; metadata?: unknown };

const styleObject = (style: MapStyle | null | undefined): StyleObject | null => (style !== null && typeof style === 'object' ? (style as unknown as StyleObject) : null);

/** The style declares this source (only a style object can be inspected; a style URL never counts). */
export const styleHasSource = (style: MapStyle | null | undefined, sourceId: string): boolean => {
  const sources = styleObject(style)?.sources;
  return sources !== undefined && sources !== null && typeof sources === 'object' && sourceId in sources;
};

/** The style has a glyph URL, so symbol layers with text can draw. */
export const styleHasGlyphs = (style: MapStyle | null | undefined): boolean => typeof styleObject(style)?.glyphs === 'string';

/**
 * An offline image's local file (`offline-floor-<id>`), for viewers that draw the image outside the offline style: the
 * image source's URL, else the pixel-only entry in the style metadata.
 */
export const styleImageSourceUrl = (style: MapStyle | null | undefined, sourceId: string): string | null => {
  const object = styleObject(style);
  const source = object?.sources?.[sourceId];
  if (source !== null && typeof source === 'object') {
    const { type, url } = source as { type?: unknown; url?: unknown };
    if (type === 'image' && typeof url === 'string' && url.length > 0) return url;
  }
  const metadata = object?.metadata;
  const pixelImages = metadata !== null && typeof metadata === 'object' ? (metadata as Record<string, unknown>)[OFFLINE_PIXEL_IMAGES_METADATA] : null;
  const local = pixelImages !== null && typeof pixelImages === 'object' ? (pixelImages as Record<string, unknown>)[sourceId] : null;
  return typeof local === 'string' && local.length > 0 ? local : null;
};
