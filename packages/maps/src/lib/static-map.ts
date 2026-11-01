import { isSafeMapUrl } from '../provider/url-safety';
import type { MapColorScheme } from '../types';

/**
 * Server static maps (MapLibre plan §5.4 `StaticMapUrlTemplate`, §6.6 `Mapping/GetStaticMap`). The template is a signed
 * URL with placeholders the client fills; Core has not shipped it yet, so this is the proposed contract:
 *
 *   {lat} {lon} (alias {lng}) {zoom} {width} {height} (aliases {w} {h}) {scale} (1 or 2) {scheme} (day | night)
 *
 * Unknown placeholders stay as they are; values are URL-encoded.
 */
export interface StaticMapRequest {
  latitude: number;
  longitude: number;
  zoom: number;
  width: number;
  height: number;
  scale: number;
  scheme: MapColorScheme;
}

export const fillStaticMapTemplate = (template: string | null | undefined, request: StaticMapRequest): string | null => {
  if (!isSafeMapUrl(template)) return null;
  if (!Number.isFinite(request.latitude) || !Number.isFinite(request.longitude) || Math.abs(request.latitude) > 90 || Math.abs(request.longitude) > 180) return null;
  const width = Math.max(1, Math.round(request.width));
  const height = Math.max(1, Math.round(request.height));
  const values: Record<string, string> = {
    lat: request.latitude.toFixed(6),
    lon: request.longitude.toFixed(6),
    lng: request.longitude.toFixed(6),
    zoom: String(Math.max(0, Math.min(22, Math.round(request.zoom * 100) / 100))),
    width: String(width),
    height: String(height),
    w: String(width),
    h: String(height),
    scale: String(request.scale >= 1.5 ? 2 : 1),
    scheme: request.scheme === 'dark' ? 'night' : 'day',
  };
  return template.trim().replace(/\{([a-z]+)\}/gi, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key.toLowerCase()) ? encodeURIComponent(values[key.toLowerCase()]) : match));
};
