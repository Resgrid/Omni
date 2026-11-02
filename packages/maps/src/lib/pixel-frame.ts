import type { ImageCoordinates } from '../rg/types';
import type { LngLat } from '../types';

/**
 * Pixel-space custom maps and floors (MapLibre plan D21): a layer with no geographic bounds is an image only. MapLibre has
 * no non-geographic CRS, so Omni draws it as an `image` source in a synthetic local frame next to (0, 0), where Web
 * Mercator is practically linear, sized to the image's aspect ratio.
 *
 * Regions and zones drawn on such a layer in Core's editors (Leaflet `CRS.Simple`) are stored in `PixelGeometry` as
 * `[x, y]` pairs in a 0–1000 square over the image, x to the right and y up from the bottom-left corner, whatever the
 * image's real size. They are mapped onto the same image here, so they line up exactly as they did in the editor.
 */

/** Core's editors place the image over this square (`[[0, 0], [1000, 1000]]`). */
export const PIXEL_EDITOR_EXTENT = 1000;

/** Width of the synthetic frame in degrees (about 2.2 km at the equator: room to zoom, no visible distortion). */
const FRAME_WIDTH_DEGREES = 0.02;

export interface PixelFrame {
  /** Image corners: top-left, top-right, bottom-right, bottom-left. */
  corners: ImageCoordinates;
  /** `[west, south, east, north]`. */
  bounds: [number, number, number, number];
  center: LngLat;
  /** A point in Core's 0–1000 editor square to its place on the map. */
  toLngLat: (x: number, y: number) => LngLat;
}

/** The frame for an image of this size (unknown or bad sizes are treated as square). */
export function createPixelFrame(width: number | null | undefined, height: number | null | undefined): PixelFrame {
  const ratio = typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0 && Number.isFinite(width / height) ? height / width : 1;
  const east = FRAME_WIDTH_DEGREES;
  const north = FRAME_WIDTH_DEGREES * Math.min(Math.max(ratio, 0.05), 20);
  return {
    corners: [
      [0, north],
      [east, north],
      [east, 0],
      [0, 0],
    ],
    bounds: [0, 0, east, north],
    center: [east / 2, north / 2],
    toLngLat: (x, y) => [(x / PIXEL_EDITOR_EXTENT) * east, (y / PIXEL_EDITOR_EXTENT) * north],
  };
}

export interface PixelRegion {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  /** `PixelGeometry`: `[[x, y], …]` in the editor square (a GeoJSON polygon with pixel coordinates is accepted too). */
  pixelGeometry: string | null;
}

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1]);

/** The outer ring of a `PixelGeometry` value, in editor coordinates; null when it is not a usable polygon. */
export function parsePixelRing(value: string | null | undefined): [number, number][] | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const geometry = (parsed as { type?: string; geometry?: unknown }).type === 'Feature' ? (parsed as { geometry?: unknown }).geometry : parsed;
    const coordinates = (geometry as { type?: string; coordinates?: unknown } | null)?.type === 'Polygon' ? (geometry as { coordinates: unknown[] }).coordinates[0] : null;
    parsed = coordinates ?? null;
  }
  if (!Array.isArray(parsed)) return null;
  const ring = parsed.filter(isPair).map(([x, y]) => [x, y] as [number, number]);
  return ring.length >= 3 ? ring : null;
}

/** Pixel regions as GeoJSON polygons in the frame (closed rings; regions without a usable outline are skipped). */
export function pixelRegionsToFeatureCollection(regions: readonly PixelRegion[], frame: PixelFrame): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  for (const region of regions) {
    const ring = parsePixelRing(region.pixelGeometry);
    if (!ring) continue;
    const coordinates = ring.map(([x, y]) => frame.toLngLat(x, y) as GeoJSON.Position);
    const [first] = coordinates;
    const last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([first[0], first[1]]);
    features.push({ type: 'Feature', id: region.id, geometry: { type: 'Polygon', coordinates: [coordinates] }, properties: { regionId: region.id, name: region.name, color: region.color || '#3b82f6' } });
  }
  return { type: 'FeatureCollection', features };
}

/** A layer or floor is pixel-only when it has no usable geographic bounds. */
export const hasGeoBounds = (bounds: { BoundsNELat: number | null; BoundsNELon: number | null; BoundsSWLat: number | null; BoundsSWLon: number | null }): boolean => {
  const { BoundsNELat: north, BoundsNELon: east, BoundsSWLat: south, BoundsSWLon: west } = bounds;
  const finite = (value: number | null): value is number => typeof value === 'number' && Number.isFinite(value);
  return finite(north) && finite(east) && finite(south) && finite(west) && north > south && east !== west && !(north === 0 && east === 0 && south === 0 && west === 0);
};
