import { gunzipSync, strFromU8 } from 'fflate';

import { withCheckedLayerColors } from '../lib/feature-colors';
import type { OfflineDepartmentData } from './types';

/**
 * The installed `DepartmentData` bundle (MapLibre plan §19.2–19.3): Core's `GetOfflineDepartmentData` serves a gzip JSON
 * object `{ "<section>": FeatureCollection, … }` as the file itself (no Content-Encoding). Core's sections today are
 * `layers` (map layers and geofences, `layerId`/`layerName`/`layerColor`/`onByDefault` properties), `stations` (station
 * points and boundaries, `kind` = `station` | `boundary`), `pois`, `customMapRegions` and `indoorZones`; unknown sections
 * are kept when they are valid FeatureCollections (later Core versions add more). The composer turns each section into an
 * `offline-dept-<section>` GeoJSON source. The `layers` features get their checked colour here (`withCheckedLayerColors`), as the
 * online layers do, so a colour MapLibre cannot read never reaches the style.
 */
export const OFFLINE_DEPARTMENT_SECTIONS = ['layers', 'stations', 'pois', 'customMapRegions', 'indoorZones'] as const;
export type OfflineDepartmentSection = (typeof OFFLINE_DEPARTMENT_SECTIONS)[number];

/** Refuse bundles that would inflate past this (a tampered or broken file must not exhaust memory). */
export const MAX_DEPARTMENT_DATA_BYTES = 64 * 1024 * 1024;

const SECTION_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const isGzip = (bytes: Uint8Array): boolean => bytes.length >= 18 && bytes[0] === 0x1f && bytes[1] === 0x8b;

/** gzip ISIZE (uncompressed length mod 2^32) from the trailer. */
const gzipInflatedSize = (bytes: Uint8Array): number => {
  const end = bytes.length;
  return (bytes[end - 4] | (bytes[end - 3] << 8) | (bytes[end - 2] << 16) | (bytes[end - 1] << 24)) >>> 0;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isFeature = (value: unknown): value is GeoJSON.Feature => isObject(value) && value.type === 'Feature' && (value.geometry === null || (isObject(value.geometry) && typeof value.geometry.type === 'string'));

/**
 * Core copies stored region and zone geometry as is, and an editor may have saved a whole Feature there: such a feature's
 * `geometry` is itself a Feature, which MapLibre rejects. Its inner geometry is used instead.
 */
const unwrapNestedFeature = (feature: GeoJSON.Feature): GeoJSON.Feature | null => {
  const geometry = feature.geometry as unknown;
  if (!isObject(geometry) || geometry.type !== 'Feature') return feature;
  const inner = geometry.geometry;
  return isObject(inner) && typeof inner.type === 'string' && inner.type !== 'Feature' ? { ...feature, geometry: inner as unknown as GeoJSON.Geometry } : null;
};

/** Validates the parsed JSON: keeps sections that are FeatureCollections, and their well-formed features. */
export function toOfflineDepartmentData(value: unknown): OfflineDepartmentData | null {
  if (!isObject(value)) return null;
  const data: OfflineDepartmentData = {};
  for (const [section, collection] of Object.entries(value)) {
    if (!SECTION_NAME.test(section) || !isObject(collection) || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) continue;
    const features = collection.features
      .filter(isFeature)
      .map(unwrapNestedFeature)
      .filter((feature): feature is GeoJSON.Feature => feature !== null);
    const checked: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

    data[section] = section === 'layers' ? withCheckedLayerColors(checked) : checked;
  }
  return Object.keys(data).length > 0 ? data : null;
}

/** Decodes the stored bundle (gzip, or plain JSON from an older server); null when unreadable or too large. */
export function decodeOfflineDepartmentData(bytes: Uint8Array): OfflineDepartmentData | null {
  try {
    let json = bytes;
    if (isGzip(bytes)) {
      if (gzipInflatedSize(bytes) > MAX_DEPARTMENT_DATA_BYTES) return null;
      json = gunzipSync(bytes);
    } else if (bytes.length > MAX_DEPARTMENT_DATA_BYTES) {
      return null;
    }
    return toOfflineDepartmentData(JSON.parse(strFromU8(json)));
  } catch {
    return null;
  }
}
