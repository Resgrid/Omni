import type { IncidentCommandBoard, IncidentMapAnnotation, ResourceAssignment } from '@resgrid/models';

import { activeAssignments, isDepartmentUnitKind, parseCoordinates } from './board';

/**
 * Command-map content from a board (IC `command-map/[callId]`, `incident-map-layers`; Dispatch tactical map). Pure:
 * GeoJSON annotations parsed defensively (server strings, possibly malformed), fixed sites and resource positions.
 */

export type LngLat = [number, number];

interface GeometryLike {
  type: string;
  coordinates?: unknown;
  geometries?: GeometryLike[];
}

interface FeatureLike {
  type: 'Feature';
  geometry: GeometryLike | null;
  properties: Record<string, unknown>;
}

export interface AnnotationShapes {
  /** Lines and polygons for a ShapeSource (FeatureCollection). */
  shapes: { type: 'FeatureCollection'; features: FeatureLike[] };
  /** Point annotations (symbols, text, markers) drawn as labelled markers. */
  points: { id: string; coordinate: LngLat; label: string | null }[];
}

const isLngLat = (value: unknown): value is LngLat =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]) &&
  Math.abs(value[1]) <= 90 &&
  Math.abs(value[0]) <= 180;

const toGeometries = (parsed: unknown): GeometryLike[] => {
  if (!parsed || typeof parsed !== 'object') return [];
  const value = parsed as { type?: unknown; geometry?: unknown; features?: unknown; coordinates?: unknown; geometries?: unknown };
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) return value.features.flatMap(toGeometries);
  if (value.type === 'Feature') return toGeometries(value.geometry);
  if (value.type === 'GeometryCollection' && Array.isArray(value.geometries)) return (value.geometries as unknown[]).flatMap(toGeometries);
  if (typeof value.type === 'string' && value.coordinates !== undefined) return [value as GeometryLike];
  return [];
};

/** Parses every live annotation; anything unparseable is skipped rather than breaking the map. */
export function annotationShapes(annotations: readonly IncidentMapAnnotation[] | null | undefined): AnnotationShapes {
  const features: FeatureLike[] = [];
  const points: AnnotationShapes['points'] = [];
  for (const annotation of annotations ?? []) {
    if (annotation.DeletedOn) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(annotation.GeoJson);
    } catch {
      continue;
    }
    toGeometries(parsed).forEach((geometry, index) => {
      if (geometry.type === 'Point') {
        if (isLngLat(geometry.coordinates)) points.push({ id: `${annotation.IncidentMapAnnotationId}-${index}`, coordinate: [geometry.coordinates[0], geometry.coordinates[1]], label: annotation.Label ?? null });
        return;
      }
      if (geometry.type === 'LineString' || geometry.type === 'Polygon' || geometry.type === 'MultiLineString' || geometry.type === 'MultiPolygon') {
        features.push({ type: 'Feature', geometry, properties: { id: annotation.IncidentMapAnnotationId, label: annotation.Label ?? '', kind: geometry.type.includes('Polygon') ? 'polygon' : 'line' } });
      }
    });
  }
  return { shapes: { type: 'FeatureCollection', features }, points };
}

export type SiteKind = 'command-post' | 'staging' | 'rehab' | 'call';

export interface MapSite {
  kind: SiteKind;
  coordinate: LngLat;
  label: string | null;
}

/** The incident's fixed sites: ICP/command post, staging, rehab, plus the call location. */
export function incidentSites(board: IncidentCommandBoard | null | undefined, call?: { Latitude?: string | null; Longitude?: string | null; Address?: string | null } | null): MapSite[] {
  const command = board?.Command;
  const sites: MapSite[] = [];
  const add = (kind: SiteKind, lat: string | null | undefined, lon: string | null | undefined, label: string | null | undefined) => {
    const position = parseCoordinates(lat, lon);
    if (position) sites.push({ kind, coordinate: [position.longitude, position.latitude], label: label ?? null });
  };
  add('call', call?.Latitude, call?.Longitude, call?.Address);
  add('command-post', command?.CommandPostLatitude, command?.CommandPostLongitude, command?.CommandPostLocationText);
  add('staging', command?.StagingLatitude, command?.StagingLongitude, command?.StagingLocationText);
  add('rehab', command?.RehabLatitude, command?.RehabLongitude, command?.RehabLocationText);
  return sites;
}

export interface ResourceMarker {
  assignment: ResourceAssignment;
  coordinate: LngLat;
  /** The lane's colour (resources inherit it on maps), or null in the pool. */
  color: string | null;
}

/** Department units on the incident that have a known position, coloured by their lane. */
export function resourceMarkers(board: IncidentCommandBoard | null | undefined, position: (assignment: ResourceAssignment) => { latitude: number; longitude: number } | null): ResourceMarker[] {
  const nodes = board?.Nodes ?? [];
  return activeAssignments(board?.Assignments)
    .filter((assignment) => isDepartmentUnitKind(assignment.ResourceKind))
    .flatMap((assignment) => {
      const found = position(assignment);
      if (!found) return [];
      const node = nodes.find((candidate) => candidate.CommandStructureNodeId === assignment.CommandStructureNodeId);
      return [{ assignment, coordinate: [found.longitude, found.latitude] as LngLat, color: node?.Color ?? null }];
    });
}

/** Where to centre the map: the saved incident-map view, else the first site or resource. */
export function initialMapCenter(board: IncidentCommandBoard | null | undefined, sites: readonly MapSite[], resources: readonly ResourceMarker[]): { center: LngLat; zoom: number } | null {
  const saved = parseCoordinates(board?.Command?.MapCenterLatitude, board?.Command?.MapCenterLongitude);
  const zoom = parseFloat(board?.Command?.MapZoomLevel ?? '');
  if (saved) return { center: [saved.longitude, saved.latitude], zoom: Number.isFinite(zoom) ? Math.min(22, Math.max(0, zoom)) : 16 };
  const first = sites[0]?.coordinate ?? resources[0]?.coordinate;
  return first ? { center: first, zoom: 16 } : null;
}
