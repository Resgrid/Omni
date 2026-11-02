import { angleBetween } from './geo';
import type { NavFix, NavProgress } from './progress';
import type { NavBanner, NavBannerText, NavRoute, NavVoiceInstruction } from './route-model';

// ── Off-route detection (MapLibre plan §9.2) ───────────────────────────────────────────────────────────────────────────

export interface OffRouteOptions {
  /** Never off the route closer than this (metres). */
  minDistanceMeters: number;
  /** Off-route distance grows with poor accuracy: max(min, factor × accuracy). */
  accuracyFactor: number;
  /** Fixes beyond the threshold in a row before the vehicle is off the route. */
  consecutiveFixes: number;
  /** Driving against the route for this long (ms) is off the route too. */
  oppositeHeadingMs: number;
  oppositeAngle: number;
  /** Course is only trusted above this speed (m/s). */
  minHeadingSpeed: number;
  /** Fixes worse than this accuracy (metres) neither count nor reset. */
  maxUsableAccuracy: number;
}

export const DEFAULT_OFF_ROUTE_OPTIONS: OffRouteOptions = {
  minDistanceMeters: 30,
  accuracyFactor: 1.5,
  consecutiveFixes: 3,
  oppositeHeadingMs: 5_000,
  oppositeAngle: 135,
  minHeadingSpeed: 3,
  maxUsableAccuracy: 100,
};

export interface OffRouteState {
  strikes: number;
  oppositeSince: number | null;
  offRoute: boolean;
}

export const INITIAL_OFF_ROUTE_STATE: OffRouteState = { strikes: 0, oppositeSince: null, offRoute: false };

export function updateOffRoute(state: OffRouteState, progress: NavProgress, fix: NavFix, options: OffRouteOptions = DEFAULT_OFF_ROUTE_OPTIONS): OffRouteState {
  if (fix.accuracy !== null && fix.accuracy > options.maxUsableAccuracy) return state;
  const threshold = Math.max(options.minDistanceMeters, options.accuracyFactor * (fix.accuracy ?? 0));
  const strikes = progress.distanceFromRoute > threshold ? state.strikes + 1 : 0;
  const moving = fix.heading !== null && fix.speed !== null && fix.speed >= options.minHeadingSpeed;
  const opposite = moving && angleBetween(fix.heading as number, progress.routeBearing) >= options.oppositeAngle;
  const oppositeSince = opposite ? (state.oppositeSince ?? fix.timestamp) : null;
  const offRoute = strikes >= options.consecutiveFixes || (oppositeSince !== null && fix.timestamp - oppositeSince >= options.oppositeHeadingMs);
  return { strikes, oppositeSince, offRoute };
}

// ── Reroute policy (cost guard) ────────────────────────────────────────────────────────────────────────────────────────

export interface ReroutePolicy {
  minIntervalMs: number;
  maxPerSession: number;
}

export const DEFAULT_REROUTE_POLICY: ReroutePolicy = { minIntervalMs: 10_000, maxPerSession: 30 };

export const canReroute = (now: number, lastRerouteAt: number | null, rerouteCount: number, policy: ReroutePolicy = DEFAULT_REROUTE_POLICY): boolean =>
  rerouteCount < policy.maxPerSession && (lastRerouteAt === null || now - lastRerouteAt >= policy.minIntervalMs);

// ── Voice prompts ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** How far past a maneuver (metres) a prompt for it is still worth speaking. */
const STALE_PROMPT_METERS = 15;

/**
 * Prompts that became due since the last fix. When several are due at once (a jump, a late fix) only the newest is
 * spoken; the rest are marked spoken. Prompts for a maneuver already passed are dropped.
 */
export function dueVoiceInstructions(route: NavRoute, progress: NavProgress, spoken: ReadonlySet<string>): { speak: NavVoiceInstruction | null; markSpoken: string[] } {
  const due: NavVoiceInstruction[] = [];
  for (const step of route.steps) {
    if (step.startDistance > progress.distanceAlong) break;
    for (const instruction of step.voice) {
      if (spoken.has(instruction.id) || instruction.triggerAt > progress.distanceAlong) continue;
      due.push(instruction);
    }
  }
  if (due.length === 0) return { speak: null, markSpoken: [] };
  const newest = due[due.length - 1];
  const step = route.steps[Number(newest.id.split(':')[0])];
  const stale = step !== undefined && progress.distanceAlong > step.endDistance + STALE_PROMPT_METERS;
  return { speak: stale ? null : newest, markSpoken: due.map((instruction) => instruction.id) };
}

/** Fallback prompt when the provider sent no voice instructions: the next maneuver's text, once, within this distance. */
export const FALLBACK_PROMPT_METERS = 150;

// ── Banner ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface NavBannerState {
  primary: NavBannerText;
  secondary: NavBannerText | null;
  sub: NavBannerText | null;
  /** Maneuver the banner describes. */
  maneuverType: string;
  modifier: string | null;
  exit: number | null;
  distanceToManeuver: number;
  /** Lanes from `sub` components, when the provider sent them. */
  lanes: { directions: string[]; active: boolean }[];
}

const textOnly = (text: string): NavBannerText => ({ text, type: null, modifier: null, degrees: null, components: [] });

/** The banner for the current progress: the provider banner in effect, else one built from the next maneuver. */
export function currentBanner(route: NavRoute, progress: NavProgress): NavBannerState | null {
  const step = route.steps[progress.stepIndex];
  if (!step) return null;
  const next = route.steps[step.index + 1] ?? null;
  let banner: NavBanner | null = null;
  for (const candidate of step.banners) {
    if (candidate.showFrom <= progress.distanceAlong) banner = candidate;
  }
  if (!banner && step.banners.length > 0) banner = step.banners[0];
  const target = next ?? step;
  if (banner) {
    const lanes = (banner.sub?.components ?? []).filter((component) => component.type === 'lane').map((component) => ({ directions: component.directions, active: component.active }));
    return {
      primary: banner.primary,
      secondary: banner.secondary,
      sub: banner.sub,
      maneuverType: banner.primary.type ?? target.maneuver.type,
      modifier: banner.primary.modifier ?? target.maneuver.modifier,
      exit: target.maneuver.exit,
      distanceToManeuver: progress.distanceToManeuver,
      lanes,
    };
  }
  const text = target.maneuver.instruction ?? target.name;
  if (!text) return null;
  return {
    primary: textOnly(text),
    secondary: null,
    sub: null,
    maneuverType: target.maneuver.type,
    modifier: target.maneuver.modifier,
    exit: target.maneuver.exit,
    distanceToManeuver: progress.distanceToManeuver,
    lanes: [],
  };
}

// ── Arrival ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Default arrival radius (metres) — Core's setting 122 default. */
export const DEFAULT_ARRIVAL_RADIUS_METERS = 50;

/**
 * Arrived at a leg's destination (the leg being driven to; by default the one under the snapped position): within the
 * radius of it, or within half the radius of — or past — the leg's end along the route.
 */
export function hasArrived(route: NavRoute, progress: NavProgress, fix: NavFix, radiusMeters: number = DEFAULT_ARRIVAL_RADIUS_METERS, legIndex: number = progress.legIndex): boolean {
  const leg = route.legs[Math.max(0, Math.min(legIndex, route.legs.length - 1))];
  const [lon, lat] = leg.destination;
  const dLat = (fix.latitude - lat) * 111_320;
  const dLon = (fix.longitude - lon) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const direct = Math.sqrt(dLat * dLat + dLon * dLon);
  return direct <= radiusMeters || leg.endDistance - progress.distanceAlong <= radiusMeters / 2;
}

// ── ETA reporting policy (§9.4) ─────────────────────────────────────────────────────────────────────────────────────────

export interface EtaReportPolicy {
  /** Never more often than this while navigating. */
  minIntervalMs: number;
  /** Report when the ETA moved at least this much… */
  minChangeMs: number;
  /** …or when this long passed without a report. */
  maxSilenceMs: number;
}

export const DEFAULT_ETA_REPORT_POLICY: EtaReportPolicy = { minIntervalMs: 15_000, minChangeMs: 20_000, maxSilenceMs: 60_000 };

export interface LastEtaReport {
  at: number;
  etaMs: number;
}

/** Whether a Progress report is due (Started, Rerouted, Arrived and Ended are always sent). */
export function shouldReportProgress(last: LastEtaReport | null, now: number, etaMs: number, policy: EtaReportPolicy = DEFAULT_ETA_REPORT_POLICY): boolean {
  if (!last) return true;
  if (now - last.at < policy.minIntervalMs) return false;
  return Math.abs(etaMs - last.etaMs) >= policy.minChangeMs || now - last.at >= policy.maxSilenceMs;
}
