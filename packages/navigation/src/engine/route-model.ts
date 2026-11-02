import { cumulativeDistances, haversineMeters, isValidLngLat, type LngLat } from './geo';
import { decodePolyline } from './polyline';

/**
 * The route a navigation session follows, built from the server's normalized route (MapLibre plan D4: the OSRM v5 /
 * Mapbox Directions route object — polyline6 geometry, legs with steps, maneuvers, `voiceInstructions` and
 * `bannerInstructions`), which Valhalla, Mapbox, OSRM and Core's Google adapter all produce. Every distance here is
 * measured along the decoded geometry, so progress, prompts and banners share one ruler.
 */

export interface NavManeuver {
  /** depart, turn, new name, continue, merge, on ramp, off ramp, fork, end of road, roundabout, rotary, exit roundabout, notification, arrive… */
  type: string;
  /** uturn, sharp right, right, slight right, straight, slight left, left, sharp left; null when absent. */
  modifier: string | null;
  location: LngLat;
  bearingBefore: number;
  bearingAfter: number;
  /** The provider's text for this maneuver (fallback banner and prompt). */
  instruction: string | null;
  /** Roundabout exit number. */
  exit: number | null;
}

export interface NavVoiceInstruction {
  id: string;
  /** Speak once progress passes this distance along the route (metres). */
  triggerAt: number;
  announcement: string;
  ssml: string | null;
}

export interface NavBannerComponent {
  text: string;
  type: string | null;
  /** Lane components: the directions a lane allows and whether it is a valid lane for the maneuver. */
  directions: string[];
  active: boolean;
}

export interface NavBannerText {
  text: string;
  type: string | null;
  modifier: string | null;
  degrees: number | null;
  components: NavBannerComponent[];
}

export interface NavBanner {
  /** Show from this distance along the route (metres). */
  showFrom: number;
  primary: NavBannerText;
  secondary: NavBannerText | null;
  sub: NavBannerText | null;
}

export interface NavStep {
  index: number;
  legIndex: number;
  name: string;
  /** Provider distance and duration. */
  distance: number;
  duration: number;
  /** Along the decoded geometry. */
  startDistance: number;
  endDistance: number;
  maneuver: NavManeuver;
  voice: NavVoiceInstruction[];
  banners: NavBanner[];
}

export interface NavLeg {
  index: number;
  distance: number;
  duration: number;
  startDistance: number;
  endDistance: number;
  firstStep: number;
  lastStep: number;
  /** Where the leg ends (the stop or destination). */
  destination: LngLat;
}

export interface NavRoute {
  coordinates: LngLat[];
  cumulative: number[];
  /** Geometry length, metres. */
  distance: number;
  /** Provider duration, seconds. */
  duration: number;
  steps: NavStep[];
  legs: NavLeg[];
  /** The provider sent voice or banner instructions (navigation-grade); false for a line with step text only. */
  hasInstructions: boolean;
  /** Congestion per geometry segment (Mapbox annotations), else null. */
  congestion: (string | null)[] | null;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const decodeGeometry = (value: unknown): LngLat[] => {
  if (typeof value === 'string') return decodePolyline(value, 6).filter(isValidLngLat);
  if (isObject(value) && Array.isArray(value.coordinates)) return (value.coordinates as unknown[]).filter(isValidLngLat).map((c) => [c[0], c[1]] as LngLat);
  return [];
};

const parseBannerText = (value: unknown): NavBannerText | null => {
  if (!isObject(value)) return null;
  const text = str(value.text) ?? '';
  const components: NavBannerComponent[] = arr(value.components)
    .filter(isObject)
    .map((component) => ({
      text: str(component.text) ?? '',
      type: str(component.type),
      directions: arr(component.directions).filter((d): d is string => typeof d === 'string'),
      active: component.active === true,
    }));
  if (!text && components.length === 0) return null;
  return { text, type: str(value.type), modifier: str(value.modifier), degrees: typeof value.degrees === 'number' ? value.degrees : null, components };
};

const parseManeuver = (value: unknown, fallbackLocation: LngLat): NavManeuver => {
  const maneuver = isObject(value) ? value : {};
  return {
    type: str(maneuver.type) ?? 'continue',
    modifier: str(maneuver.modifier),
    location: isValidLngLat(maneuver.location) ? [maneuver.location[0], maneuver.location[1]] : fallbackLocation,
    bearingBefore: num(maneuver.bearing_before),
    bearingAfter: num(maneuver.bearing_after),
    instruction: str(maneuver.instruction),
    exit: typeof maneuver.exit === 'number' ? maneuver.exit : null,
  };
};

/** Appends `points` to `coordinates`, skipping the first when it repeats the last one (steps share end points). */
const appendPoints = (coordinates: LngLat[], points: readonly LngLat[]): void => {
  for (const point of points) {
    const last = coordinates[coordinates.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    coordinates.push(point);
  }
};

/** Distance along the geometry of the coordinate nearest `location`, searching forward from `fromIndex`. */
const nearestIndexFrom = (coordinates: readonly LngLat[], location: LngLat, fromIndex: number): number => {
  let best = fromIndex;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = fromIndex; i < coordinates.length; i += 1) {
    const d = haversineMeters(coordinates[i], location);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
};

interface RawStep {
  legIndex: number;
  json: Json;
  points: LngLat[];
}

/**
 * Builds a `NavRoute` from the server's normalized route object (`Route` in Routing/GetRoute, GetCallRoute and live
 * GetInstanceDirections). Returns null when there is no usable geometry. `fallbackGeometry` (the GeoJSON `Geometry`
 * string) draws the line when the route object is missing; such a route has no steps.
 */
export function parseNavRoute(route: unknown, fallbackGeometry?: string | null): NavRoute | null {
  const object = isObject(route) ? route : null;
  const rawSteps: RawStep[] = [];
  const legsJson = object ? arr(object.legs).filter(isObject) : [];
  legsJson.forEach((leg, legIndex) => {
    for (const step of arr(leg.steps).filter(isObject)) rawSteps.push({ legIndex, json: step, points: decodeGeometry(step.geometry) });
  });

  // Prefer the concatenated step geometries (exact step boundaries); else the overview line with steps placed by their
  // maneuver locations; else the GeoJSON fallback.
  const stepsHaveGeometry = rawSteps.length > 0 && rawSteps.every((step) => step.points.length > 0);
  let coordinates: LngLat[] = [];
  if (stepsHaveGeometry) {
    for (const step of rawSteps) appendPoints(coordinates, step.points);
  } else if (object) {
    coordinates = decodeGeometry(object.geometry);
  }
  if (coordinates.length < 2 && fallbackGeometry) {
    try {
      const parsed: unknown = JSON.parse(fallbackGeometry);
      const geometry = isObject(parsed) && parsed.type === 'Feature' ? parsed.geometry : parsed;
      coordinates = decodeGeometry(geometry);
    } catch {
      coordinates = [];
    }
  }
  if (coordinates.length < 2) return null;

  const cumulative = cumulativeDistances(coordinates);
  const total = cumulative[cumulative.length - 1];

  // Step boundaries along the geometry.
  const starts: number[] = [];
  if (stepsHaveGeometry) {
    let walked = 0;
    for (const step of rawSteps) {
      starts.push(walked);
      // A step's points are a contiguous run of the route coordinates, so its own length advances the ruler.
      const stepPoints: LngLat[] = [];
      appendPoints(stepPoints, step.points);
      for (let i = 1; i < stepPoints.length; i += 1) walked += haversineMeters(stepPoints[i - 1], stepPoints[i]);
    }
  } else {
    let searchFrom = 0;
    for (const step of rawSteps) {
      const maneuver = parseManeuver(step.json.maneuver, coordinates[searchFrom]);
      const at = nearestIndexFrom(coordinates, maneuver.location, searchFrom);
      starts.push(cumulative[at]);
      searchFrom = at;
    }
  }

  let hasInstructions = false;
  const steps: NavStep[] = rawSteps.map((raw, index) => {
    const startDistance = Math.min(starts[index] ?? 0, total);
    const nextStart = index + 1 < rawSteps.length ? (starts[index + 1] ?? total) : total;
    const endDistance = Math.max(startDistance, Math.min(nextStart, total));
    const maneuver = parseManeuver(raw.json.maneuver, raw.points[0] ?? coordinates[0]);
    const voice: NavVoiceInstruction[] = arr(raw.json.voiceInstructions)
      .filter(isObject)
      .map((instruction, i) => ({
        id: `${index}:${i}`,
        triggerAt: Math.max(startDistance, endDistance - num(instruction.distanceAlongGeometry, endDistance - startDistance)),
        announcement: str(instruction.announcement) ?? '',
        ssml: str(instruction.ssmlAnnouncement),
      }))
      .filter((instruction) => instruction.announcement.length > 0);
    const banners: NavBanner[] = arr(raw.json.bannerInstructions)
      .filter(isObject)
      .map((banner) => {
        const primary = parseBannerText(banner.primary);
        return primary
          ? { showFrom: Math.max(startDistance, endDistance - num(banner.distanceAlongGeometry, endDistance - startDistance)), primary, secondary: parseBannerText(banner.secondary), sub: parseBannerText(banner.sub) }
          : null;
      })
      .filter((banner): banner is NavBanner => banner !== null)
      .sort((a, b) => a.showFrom - b.showFrom);
    if (voice.length > 0 || banners.length > 0) hasInstructions = true;
    return { index, legIndex: raw.legIndex, name: str(raw.json.name) ?? '', distance: num(raw.json.distance), duration: num(raw.json.duration), startDistance, endDistance, maneuver, voice, banners };
  });

  const legs: NavLeg[] = legsJson.map((leg, legIndex) => {
    const legSteps = steps.filter((step) => step.legIndex === legIndex);
    const first = legSteps[0];
    const last = legSteps[legSteps.length - 1];
    const startDistance = first ? first.startDistance : 0;
    const endDistance = last ? last.endDistance : total;
    return {
      index: legIndex,
      distance: num(leg.distance),
      duration: num(leg.duration),
      startDistance,
      endDistance,
      firstStep: first ? first.index : 0,
      lastStep: last ? last.index : -1,
      destination: last ? last.maneuver.location : coordinates[coordinates.length - 1],
    };
  });
  if (legs.length === 0) {
    legs.push({ index: 0, distance: total, duration: object ? num(object.duration) : 0, startDistance: 0, endDistance: total, firstStep: 0, lastStep: steps.length - 1, destination: coordinates[coordinates.length - 1] });
  }
  // The last leg always reaches the end of the line.
  legs[legs.length - 1] = { ...legs[legs.length - 1], endDistance: total };

  const congestion = readCongestion(legsJson, coordinates.length - 1);
  const duration = object
    ? num(
        object.duration,
        legs.reduce((sum, leg) => sum + leg.duration, 0)
      )
    : 0;
  return { coordinates, cumulative, distance: total, duration, steps, legs, hasInstructions, congestion };
}

/** Mapbox `annotation.congestion` per geometry segment, when it lines up with the decoded geometry. */
const readCongestion = (legs: Json[], segments: number): (string | null)[] | null => {
  const values: (string | null)[] = [];
  for (const leg of legs) {
    const annotation = isObject(leg.annotation) ? leg.annotation : null;
    const congestion = annotation ? arr(annotation.congestion) : [];
    if (congestion.length === 0) return null;
    for (const value of congestion) values.push(typeof value === 'string' ? value : null);
  }
  return values.length === segments ? values : null;
};

/** Remaining duration of a step from a distance along it, scaled by the part of its geometry still ahead. */
export const remainingStepDuration = (step: NavStep, distanceAlong: number): number => {
  const length = step.endDistance - step.startDistance;
  if (length <= 0) return 0;
  const ahead = Math.max(0, Math.min(length, step.endDistance - distanceAlong));
  return step.duration * (ahead / length);
};
