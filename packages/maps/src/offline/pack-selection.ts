import type { VariantManifest } from '@resgrid/config';

import type { LngLat } from '../types';
import type { OfflineAssetKind, PackBounds } from './types';

/**
 * Incident (kind 1) and route-corridor (kind 2) packs per app (MapLibre plan §19.7). Core lists, outside the response
 * area, the base-map cells around every active call of the department and along every active route plan, each with the
 * calls (`CallIds`) and route plans (`RoutePlanIds`) it serves — so each device keeps only the cells of what it works on:
 * - Unit: the crew's active call + the corridor of its route; IC: the incidents it commands; Responder: the call it
 *   responds to; Dispatch and BigBoard: none (Dispatch keeps the full area and custom maps; BigBoard its display range).
 * Decided from capabilities and the map-pack profile, never the app id. Older servers list no ids; their cells are kept
 * by distance to the focus calls and route instead.
 */

export interface OfflineExtraPackPolicy {
  /** Download incident packs near `OfflinePackFocus.incidentPoints`. */
  incidents: boolean;
  /** Download corridor packs along `OfflinePackFocus.corridorLines`. */
  corridors: boolean;
}

export const NO_EXTRA_PACKS: OfflineExtraPackPolicy = { incidents: false, corridors: false };

/** What this device works on right now (read when the manager plans downloads; `[lng, lat]`). */
export interface OfflinePackFocus {
  /** Ids of the calls the device responds to, is assigned to or commands. */
  callIds: string[];
  /** Where those calls are (older servers list cells without ids). */
  incidentPoints: LngLat[];
  /** Ids of the route plans the device drives. */
  routePlanIds: string[];
  /** Routes the device drives (route geometry, or the stops in order). */
  corridorLines: LngLat[][];
}

export const EMPTY_PACK_FOCUS: OfflinePackFocus = { callIds: [], incidentPoints: [], routePlanIds: [], corridorLines: [] };

/** What selection reads from a listed pack. */
export interface ExtraPackFacts {
  bounds?: PackBounds | null;
  /** The calls the server lists the cell for (Core `CallIds`); absent from older servers. */
  callIds?: string[] | null;
  /** The route plans the server lists the cell for (Core `RoutePlanIds`); absent from older servers. */
  routePlanIds?: string[] | null;
}

/** How the manager chooses incident/corridor packs. */
export interface OfflinePackSelection {
  policy: OfflineExtraPackPolicy;
  getFocus: () => OfflinePackFocus;
}

/** Without ids, a listed incident cell is kept within this distance of a focus call (Core's incident radius: 3 km by default, at most 25 km). */
export const INCIDENT_FOCUS_KM = 25;
/** Without ids, a listed corridor cell is kept within this distance of the route (Core's corridor buffer: 500 m by default, at most 5 km). */
export const CORRIDOR_FOCUS_KM = 5;
/** Routes are sampled this often when measured against a cell. */
const CORRIDOR_SAMPLE_KM = 1;

type VariantFacts = Pick<VariantManifest, 'offline' | 'modules'> & { capabilities: Pick<VariantManifest['capabilities'], 'location' | 'incidentCommand' | 'maps'> };

/**
 * The variant's extra packs: a device that goes to calls (it transmits its location) or commands incidents gets incident
 * packs; one that drives route plans (unit routes or in-app navigation) gets corridors; a display profile gets neither.
 */
export function resolveExtraPackPolicy(variant: VariantFacts): OfflineExtraPackPolicy {
  if (variant.offline.mapPacks === 'display') return NO_EXTRA_PACKS;
  return {
    incidents: variant.capabilities.location.transmission !== 'none' || variant.capabilities.incidentCommand === 'command',
    corridors: variant.capabilities.maps.navigationInApp || variant.modules.includes('unit-routes'),
  };
}

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const haversineKm = (a: LngLat, b: LngLat): number => {
  const dLat = toRadians(b[1] - a[1]);
  const dLng = toRadians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

const validPoint = (point: LngLat): boolean => Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

/** Distance from a point to the nearest point of `[west, south, east, north]` (0 inside). */
export function distanceToBoundsKm(point: LngLat, bounds: PackBounds): number {
  const [west, south, east, north] = bounds;
  const nearest: LngLat = [Math.min(Math.max(point[0], west), east), Math.min(Math.max(point[1], south), north)];
  return haversineKm(point, nearest);
}

/** The line's vertices plus points every `CORRIDOR_SAMPLE_KM` in between. */
const sampleLine = (line: LngLat[]): LngLat[] => {
  const points = line.filter(validPoint);
  const samples: LngLat[] = [];
  points.forEach((point, index) => {
    const previous = index > 0 ? points[index - 1] : null;
    if (previous) {
      const steps = Math.min(1000, Math.ceil(haversineKm(previous, point) / CORRIDOR_SAMPLE_KM));
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        samples.push([previous[0] + (point[0] - previous[0]) * t, previous[1] + (point[1] - previous[1]) * t]);
      }
    }
    samples.push(point);
  });
  return samples;
};

const listsAny = (listed: string[] | null | undefined, wanted: string[]): boolean => (listed ?? []).some((id) => wanted.includes(id));

/**
 * Whether this device keeps an incident or corridor pack (other kinds are always kept). A cell is shared, so either kind
 * can list calls and route plans: it is kept for a listed call the device works on (when it takes incident packs) or a
 * listed route plan it drives (when it takes corridors).
 */
export function isExtraPackWanted(kind: OfflineAssetKind, pack: ExtraPackFacts, policy: OfflineExtraPackPolicy, focus: OfflinePackFocus): boolean {
  if (kind !== 'incident' && kind !== 'corridor') return true;
  if (pack.callIds || pack.routePlanIds) {
    return (policy.incidents && listsAny(pack.callIds, focus.callIds)) || (policy.corridors && listsAny(pack.routePlanIds, focus.routePlanIds));
  }
  const bounds = pack.bounds;
  if (!bounds) return false;
  if (kind === 'incident') {
    return policy.incidents ? focus.incidentPoints.some((point) => validPoint(point) && distanceToBoundsKm(point, bounds) <= INCIDENT_FOCUS_KM) : false;
  }
  return policy.corridors ? focus.corridorLines.some((line) => sampleLine(line).some((point) => distanceToBoundsKm(point, bounds) <= CORRIDOR_FOCUS_KM)) : false;
}
