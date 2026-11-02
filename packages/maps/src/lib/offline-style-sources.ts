import { OFFLINE_CUSTOM_MAP_PREFIX, OFFLINE_DEPARTMENT_SOURCE_PREFIX, OFFLINE_FLOOR_PREFIX, offlineSafeId } from '../offline/style-composer';
import type { MapStyle } from '../types';

/**
 * What the composed offline style (MapLibre plan §19.5) carries besides the base map, so map screens can draw department
 * data from it while offline: raster PMTiles of custom maps (`offline-custom-<layer>`), indoor floor and single-image
 * custom map layers (`offline-floor-<id>`), and the department data sections as GeoJSON (`offline-dept-<section>`).
 * The composer adds the custom map and floor sources with hidden layers; screens add their own visible layer on top.
 */

export const offlineCustomMapSourceId = (layerId: string): string => `${OFFLINE_CUSTOM_MAP_PREFIX}${offlineSafeId(layerId)}`;
export const offlineFloorSourceId = (floorOrLayerId: string): string => `${OFFLINE_FLOOR_PREFIX}${offlineSafeId(floorOrLayerId)}`;
export const offlineDepartmentSourceId = (section: string): string => `${OFFLINE_DEPARTMENT_SOURCE_PREFIX}${offlineSafeId(section)}`;

type StyleObject = { sources?: Record<string, unknown>; glyphs?: unknown };

const styleObject = (style: MapStyle | null | undefined): StyleObject | null => (style !== null && typeof style === 'object' ? (style as unknown as StyleObject) : null);

/** The style declares this source (only a style object can be inspected; a style URL never counts). */
export const styleHasSource = (style: MapStyle | null | undefined, sourceId: string): boolean => {
  const sources = styleObject(style)?.sources;
  return sources !== undefined && sources !== null && typeof sources === 'object' && sourceId in sources;
};

/** The style has a glyph URL, so symbol layers with text can draw. */
export const styleHasGlyphs = (style: MapStyle | null | undefined): boolean => typeof styleObject(style)?.glyphs === 'string';

/** An offline image source's local file (`offline-floor-<id>`), for viewers that draw the image outside the offline style. */
export const styleImageSourceUrl = (style: MapStyle | null | undefined, sourceId: string): string | null => {
  const source = styleObject(style)?.sources?.[sourceId];
  if (source === null || typeof source !== 'object') return null;
  const { type, url } = source as { type?: unknown; url?: unknown };
  return type === 'image' && typeof url === 'string' && url.length > 0 ? url : null;
};
