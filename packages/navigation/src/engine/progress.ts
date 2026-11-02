import { angleBetween, bearingDegrees, type LngLat, projectOnSegment } from './geo';
import { type NavRoute, type NavStep, remainingStepDuration } from './route-model';

/** One position fix as navigation reads it. */
export interface NavFix {
  latitude: number;
  longitude: number;
  /** Course over ground, degrees; null when unknown. */
  heading: number | null;
  /** Metres per second; null when unknown. */
  speed: number | null;
  /** Horizontal accuracy, metres; null when unknown. */
  accuracy: number | null;
  /** Epoch ms. */
  timestamp: number;
}

export interface NavProgress {
  /** Snapped position along the route, metres from its start. */
  distanceAlong: number;
  snapped: LngLat;
  /** Metres between the fix and the route. */
  distanceFromRoute: number;
  segmentIndex: number;
  /** Bearing of the route segment at the snapped point. */
  routeBearing: number;
  stepIndex: number;
  legIndex: number;
  /** To the end of the current step (the next maneuver). */
  distanceToManeuver: number;
  distanceRemaining: number;
  legDistanceRemaining: number;
  /** Seconds, from the provider's step durations scaled by what is left of the current step. */
  durationRemaining: number;
  legDurationRemaining: number;
  fractionTraveled: number;
}

export interface SnapOptions {
  /** Metres ahead of the last snapped point searched first (covers a fast vehicle between fixes). */
  lookAheadMeters: number;
  /** Metres behind the last snapped point still accepted (GPS jitter, short reversals). */
  lookBehindMeters: number;
  /** Penalty (metres) for a segment whose bearing opposes the fix's course while moving. */
  headingPenaltyMeters: number;
  /** Below this speed (m/s) the course is ignored. */
  minHeadingSpeed: number;
}

export const DEFAULT_SNAP_OPTIONS: SnapOptions = { lookAheadMeters: 500, lookBehindMeters: 60, headingPenaltyMeters: 25, minHeadingSpeed: 3 };

interface Candidate {
  segment: number;
  point: LngLat;
  distance: number;
  along: number;
  score: number;
}

const bestCandidate = (route: NavRoute, fix: NavFix, from: number, to: number, options: SnapOptions): Candidate | null => {
  const p: LngLat = [fix.longitude, fix.latitude];
  const useHeading = fix.heading !== null && fix.speed !== null && fix.speed >= options.minHeadingSpeed;
  let best: Candidate | null = null;
  for (let i = Math.max(0, from); i <= Math.min(route.coordinates.length - 2, to); i += 1) {
    const a = route.coordinates[i];
    const b = route.coordinates[i + 1];
    const projection = projectOnSegment(p, a, b);
    let score = projection.distance;
    if (useHeading && angleBetween(fix.heading as number, bearingDegrees(a, b)) > 100) score += options.headingPenaltyMeters;
    if (!best || score < best.score) {
      const segmentLength = route.cumulative[i + 1] - route.cumulative[i];
      best = { segment: i, point: projection.point, distance: projection.distance, along: route.cumulative[i] + segmentLength * projection.t, score };
    }
  }
  return best;
};

const segmentIndexBefore = (route: NavRoute, distance: number): number => {
  let index = 0;
  while (index < route.cumulative.length - 2 && route.cumulative[index + 1] < distance) index += 1;
  return index;
};

const stepAt = (route: NavRoute, distanceAlong: number): NavStep | null => {
  if (route.steps.length === 0) return null;
  for (let i = route.steps.length - 1; i >= 0; i -= 1) {
    const step = route.steps[i];
    // Zero-length steps (arrive) are reached only at the very end.
    if (step.endDistance > step.startDistance && distanceAlong >= step.startDistance) return step;
  }
  return route.steps[0];
};

/**
 * Snaps a fix to the route and measures progress. With `previous`, the search starts in a window around the last
 * snapped point (so a route that doubles back is not snapped to its far side); when nothing in the window is close the
 * whole route is searched.
 */
export function computeProgress(route: NavRoute, fix: NavFix, previous: Pick<NavProgress, 'distanceAlong'> | null, options: SnapOptions = DEFAULT_SNAP_OPTIONS): NavProgress {
  let candidate: Candidate | null = null;
  if (previous) {
    const from = segmentIndexBefore(route, previous.distanceAlong - options.lookBehindMeters);
    const to = segmentIndexBefore(route, previous.distanceAlong + options.lookAheadMeters) + 1;
    candidate = bestCandidate(route, fix, from, to, options);
  }
  if (!candidate || candidate.distance > options.lookAheadMeters / 2) {
    const global = bestCandidate(route, fix, 0, route.coordinates.length - 2, options);
    if (global && (!candidate || global.score < candidate.score)) candidate = global;
  }
  const chosen = candidate ?? { segment: 0, point: route.coordinates[0], distance: 0, along: 0, score: 0 };
  return progressAt(route, chosen.along, chosen.point, chosen.distance, chosen.segment);
}

/** Progress at a distance along the route (also used for the start of a session and for simulation). */
export function progressAt(route: NavRoute, distanceAlong: number, snapped: LngLat, distanceFromRoute: number, segmentIndex: number): NavProgress {
  const along = Math.max(0, Math.min(distanceAlong, route.distance));
  const step = stepAt(route, along);
  const legIndex = step ? step.legIndex : 0;
  const leg = route.legs[Math.min(legIndex, route.legs.length - 1)];
  const a = route.coordinates[segmentIndex];
  const b = route.coordinates[Math.min(segmentIndex + 1, route.coordinates.length - 1)];

  let durationRemaining = 0;
  let legDurationRemaining = 0;
  if (step) {
    const current = remainingStepDuration(step, along);
    durationRemaining = current;
    legDurationRemaining = current;
    for (let i = step.index + 1; i < route.steps.length; i += 1) {
      durationRemaining += route.steps[i].duration;
      if (route.steps[i].legIndex === legIndex) legDurationRemaining += route.steps[i].duration;
    }
  } else if (route.distance > 0) {
    durationRemaining = route.duration * ((route.distance - along) / route.distance);
    legDurationRemaining = durationRemaining;
  }

  return {
    distanceAlong: along,
    snapped,
    distanceFromRoute,
    segmentIndex,
    routeBearing: bearingDegrees(a, b),
    stepIndex: step ? step.index : 0,
    legIndex,
    distanceToManeuver: step ? Math.max(0, step.endDistance - along) : Math.max(0, route.distance - along),
    distanceRemaining: Math.max(0, route.distance - along),
    legDistanceRemaining: Math.max(0, leg.endDistance - along),
    durationRemaining,
    legDurationRemaining,
    fractionTraveled: route.distance > 0 ? along / route.distance : 1,
  };
}

/** Progress at the very start of a route (before the first fix is snapped). */
export const startProgress = (route: NavRoute): NavProgress => progressAt(route, 0, route.coordinates[0], 0, 0);
