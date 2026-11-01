import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/** `[longitude, latitude]` — the order MapLibre (native and web) and GeoJSON use. */
export type LngLat = [longitude: number, latitude: number];

/** North-east / south-west corners, the rnmapbox shape the legacy apps use. */
export interface CoordinateBounds {
  ne: LngLat;
  sw: LngLat;
}

/** A MapLibre style: a URL or a style JSON document. */
export type MapStyle = string | StyleSpecification;

export type MapColorScheme = 'light' | 'dark';

export type { StyleSpecification };

/** True for a finite `[lng, lat]` inside the valid range (rejects NaN, Infinity and out-of-range values). */
export const isValidLngLat = (value: readonly number[] | null | undefined): value is LngLat =>
  Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;

/** `[west, south, east, north]` from rnmapbox-style corners. */
export const toLngLatBounds = (bounds: CoordinateBounds): [number, number, number, number] => [bounds.sw[0], bounds.sw[1], bounds.ne[0], bounds.ne[1]];
