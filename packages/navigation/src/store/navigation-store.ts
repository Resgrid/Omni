import { type RouteDirectionLegData, type RouteIncidentData, UnitNavigationState } from '@resgrid/models';
import { create } from 'zustand';

import {
  canReroute,
  currentBanner,
  DEFAULT_ARRIVAL_RADIUS_METERS,
  dueVoiceInstructions,
  FALLBACK_PROMPT_METERS,
  hasArrived,
  INITIAL_OFF_ROUTE_STATE,
  type LastEtaReport,
  type NavBannerState,
  type OffRouteState,
  shouldReportProgress,
  updateOffRoute,
} from '../engine/guidance';
import { computeProgress, type NavFix, type NavProgress, startProgress } from '../engine/progress';
import { type NavRoute, remainingStepDuration } from '../engine/route-model';
import { getNavigationServices, type NavigationProgressReport, type NavigationRouteResult } from './services';

/**
 * The in-app navigation session (MapLibre plan §9.2): one destination at a time — a call (Routing/GetCallRoute), a
 * route instance's remaining stops (live Routes/GetInstanceDirections, one leg per stop) or a point (Routing/GetRoute).
 * Fixes come from the location store (or the simulator); the store snaps them, detects arrival and off-route, asks the
 * server for a new route when needed, speaks prompts and reports the live ETA (§9.4). Not persisted: a session ends
 * with the app.
 */

export type NavigationDestination =
  { kind: 'call'; callId: number; name: string | null } | { kind: 'route'; routeInstanceId: string; name: string | null } | { kind: 'point'; latitude: number; longitude: number; name: string | null };

export type NavigationStatus = 'idle' | 'loading' | 'navigating' | 'arrived' | 'error';

/** Why a session could not start (shown with an "Open in…" fallback). */
export type NavigationErrorCode = 'no-position' | 'no-route' | 'unavailable' | 'failed';

/** A stop at the end of a leg (route navigation). */
export interface NavigationLegStop {
  routeStopId: string | null;
  routeInstanceStopId: string | null;
  name: string | null;
  etaUtc: string | null;
}

export interface NavigationRouteMeta {
  provider: string | null;
  attribution: string | null;
  isTrafficAware: boolean;
  vehicleRestricted: boolean;
  vehicleLimitsEnforced: string | null;
  incidents: RouteIncidentData[];
  /** One entry per leg (route navigation); empty otherwise. */
  legStops: NavigationLegStop[];
  fetchedAt: number;
}

export interface NavigationState {
  status: NavigationStatus;
  destination: NavigationDestination | null;
  route: NavRoute | null;
  meta: NavigationRouteMeta | null;
  progress: NavProgress | null;
  /** The latest fix (course and speed drive the camera). */
  lastFix: NavFix | null;
  banner: NavBannerState | null;
  /** The leg being driven to (route navigation through several stops). */
  activeLegIndex: number;
  /** Seconds and metres to the active leg's destination. */
  legDurationRemaining: number;
  legDistanceRemaining: number;
  /** ETA (epoch ms) at the active leg's destination. */
  etaAt: number | null;
  offRoute: OffRouteState;
  rerouting: boolean;
  rerouteCount: number;
  lastRerouteAt: number | null;
  /** A reroute failed (no network, provider error): guidance continues on the last route. */
  usingLastRoute: boolean;
  error: NavigationErrorCode | null;
  muted: boolean;
  simulation: boolean;
  unitId: number | null;
  startedAt: number | null;

  start: (destination: NavigationDestination, options?: { unitId?: number | null; simulation?: boolean; position?: NavFix | null }) => Promise<boolean>;
  handleFix: (fix: NavFix) => void;
  reroute: (fix?: NavFix | null) => Promise<boolean>;
  /** After the stop at the active leg is done: guide to the next stop on the same route, or end when it was the last. */
  continueToNextLeg: () => void;
  /** Back to guidance after an arrival the crew dismissed (they are not there yet). */
  resumeAfterArrival: () => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
}

/** A provider-less straight line or no geometry: not something to navigate. */
const isNavigable = (result: NavigationRouteResult | null): result is NavigationRouteResult => result !== null && result.route !== null && result.navigationAvailable;

const OFF_ROUTE_DEVIATION_MS = 30_000;
/** Traffic-aware routes are refreshed this often while navigating (plan §9.2 ETA). */
const TRAFFIC_REFRESH_MS = 5 * 60_000;

interface Runtime {
  /** Route instance stops already reached and continued from in this session (a reroute must not lead back to them). */
  completedStops: Set<string>;
  spoken: Set<string>;
  fallbackSpoken: Set<number>;
  lastReport: LastEtaReport | null;
  offRouteSince: number | null;
  deviationRecorded: boolean;
  generation: number;
  lastFix: NavFix | null;
}

const runtime: Runtime = { completedStops: new Set(), spoken: new Set(), fallbackSpoken: new Set(), lastReport: null, offRouteSince: null, deviationRecorded: false, generation: 0, lastFix: null };

const resetRuntime = (): void => {
  runtime.completedStops = new Set();
  runtime.spoken = new Set();
  runtime.fallbackSpoken = new Set();
  runtime.lastReport = null;
  runtime.offRouteSince = null;
  runtime.deviationRecorded = false;
  runtime.generation += 1;
  runtime.lastFix = null;
};

const IDLE: Omit<NavigationState, 'start' | 'handleFix' | 'reroute' | 'continueToNextLeg' | 'resumeAfterArrival' | 'stop' | 'setMuted' | 'muted'> = {
  status: 'idle',
  destination: null,
  route: null,
  meta: null,
  progress: null,
  lastFix: null,
  banner: null,
  activeLegIndex: 0,
  legDurationRemaining: 0,
  legDistanceRemaining: 0,
  etaAt: null,
  offRoute: INITIAL_OFF_ROUTE_STATE,
  rerouting: false,
  rerouteCount: 0,
  lastRerouteAt: null,
  usingLastRoute: false,
  error: null,
  simulation: false,
  unitId: null,
  startedAt: null,
};

/** Seconds and metres from the snapped position to the end of a leg. */
export const remainingToLeg = (route: NavRoute, progress: NavProgress, legIndex: number): { seconds: number; meters: number } => {
  const leg = route.legs[Math.max(0, Math.min(legIndex, route.legs.length - 1))];
  const meters = Math.max(0, leg.endDistance - progress.distanceAlong);
  if (route.steps.length === 0) {
    return { seconds: route.distance > 0 ? route.duration * (meters / route.distance) : 0, meters };
  }
  let seconds = 0;
  for (const step of route.steps) {
    if (step.legIndex > leg.index) break;
    if (step.endDistance <= progress.distanceAlong) continue;
    seconds += step.startDistance < progress.distanceAlong ? remainingStepDuration(step, progress.distanceAlong) : step.duration;
  }
  return { seconds, meters };
};

const legStopsFrom = (legs: RouteDirectionLegData[] | undefined): NavigationLegStop[] =>
  (legs ?? []).map((leg) => ({ routeStopId: leg.RouteStopId ?? null, routeInstanceStopId: leg.RouteInstanceStopId ?? null, name: leg.Name ?? null, etaUtc: leg.EtaUtc ?? null }));

export const useNavigationStore = create<NavigationState>()((set, get) => {
  const services = () => getNavigationServices();

  const speak = (text: string): void => {
    if (!text || get().muted) return;
    services().voice.speak(text);
  };

  const report = (state: NavigationProgressReport['state']): void => {
    const current = get();
    const { destination, unitId, route, progress, meta } = current;
    if (!destination || destination.kind === 'point' || unitId === null || !route || !progress) return;
    const now = services().now();
    const remaining = remainingToLeg(route, progress, current.activeLegIndex);
    const legStop = meta?.legStops[current.activeLegIndex] ?? null;
    services().reportProgress({
      unitId,
      callId: destination.kind === 'call' ? destination.callId : null,
      routeInstanceId: destination.kind === 'route' ? destination.routeInstanceId : null,
      routeInstanceStopId: destination.kind === 'route' ? (legStop?.routeInstanceStopId ?? null) : null,
      state,
      etaUtc: new Date(now + remaining.seconds * 1000).toISOString(),
      remainingSeconds: Math.round(remaining.seconds),
      remainingMeters: Math.round(remaining.meters),
      isTrafficAware: meta?.isTrafficAware ?? false,
      provider: meta?.provider ?? null,
      at: now,
    });
    runtime.lastReport = { at: now, etaMs: now + remaining.seconds * 1000 };
  };

  const fetchRoute = async (destination: NavigationDestination, from: NavFix): Promise<NavigationRouteResult | null> => {
    const s = services();
    const unitId = get().unitId;
    if (destination.kind === 'call') return s.routes.toCall({ callId: destination.callId, from, unitId });
    if (destination.kind === 'route') return s.routes.toRouteStops({ routeInstanceId: destination.routeInstanceId, from });
    return s.routes.toPoint({ latitude: destination.latitude, longitude: destination.longitude, from, unitId });
  };

  const applyRoute = (result: NavigationRouteResult, fix: NavFix | null, now: number): void => {
    const route = result.route as NavRoute;
    const progress = fix ? computeProgress(route, fix, null) : startProgress(route);
    const legStops = legStopsFrom(result.legs);
    // The new route starts at the leg the crew is driving to now; a stop already reached and continued from (still
    // listed while it is checked in) is skipped.
    let activeLegIndex = 0;
    while (activeLegIndex < route.legs.length - 1 && legStops[activeLegIndex]?.routeInstanceStopId && runtime.completedStops.has(legStops[activeLegIndex].routeInstanceStopId as string)) activeLegIndex += 1;
    const remaining = remainingToLeg(route, progress, activeLegIndex);
    runtime.spoken = new Set();
    runtime.fallbackSpoken = new Set();
    set({
      route,
      meta: {
        provider: result.provider,
        attribution: result.attribution,
        isTrafficAware: result.isTrafficAware,
        vehicleRestricted: result.vehicleRestricted,
        vehicleLimitsEnforced: result.vehicleLimitsEnforced,
        incidents: result.incidents,
        legStops,
        fetchedAt: now,
      },
      progress,
      banner: currentBanner(route, progress),
      activeLegIndex,
      legDurationRemaining: remaining.seconds,
      legDistanceRemaining: remaining.meters,
      etaAt: now + remaining.seconds * 1000,
      offRoute: INITIAL_OFF_ROUTE_STATE,
      usingLastRoute: false,
    });
    runtime.offRouteSince = null;
    runtime.deviationRecorded = false;
  };

  const speakDue = (route: NavRoute, progress: NavProgress): void => {
    const { speak: next, markSpoken } = dueVoiceInstructions(route, progress, runtime.spoken);
    markSpoken.forEach((id) => runtime.spoken.add(id));
    if (next) {
      speak(next.announcement);
      return;
    }
    // Providers without voice instructions: the next maneuver's text once, close to it.
    if (!route.hasInstructions && progress.distanceToManeuver <= FALLBACK_PROMPT_METERS) {
      const nextStep = route.steps[progress.stepIndex + 1];
      if (nextStep?.maneuver.instruction && !runtime.fallbackSpoken.has(nextStep.index)) {
        runtime.fallbackSpoken.add(nextStep.index);
        speak(nextStep.maneuver.instruction);
      }
    }
  };

  return {
    ...IDLE,
    muted: false,

    start: async (destination, options = {}) => {
      const s = services();
      resetRuntime();
      const generation = runtime.generation;
      set({ ...IDLE, status: 'loading', destination, unitId: options.unitId ?? null, simulation: options.simulation === true, muted: s.preferences.isMuted() });
      const from = options.position ?? s.currentFix();
      if (!from) {
        set({ status: 'error', error: 'no-position' });
        return false;
      }
      let result: NavigationRouteResult | null;
      try {
        result = await fetchRoute(destination, from);
      } catch (error) {
        s.log('warn', 'Navigation route request failed', error);
        if (generation === runtime.generation) set({ status: 'error', error: 'failed' });
        return false;
      }
      if (generation !== runtime.generation) return false;
      if (!result || result.route === null) {
        set({ status: 'error', error: 'no-route' });
        return false;
      }
      if (!isNavigable(result)) {
        set({ status: 'error', error: 'unavailable' });
        return false;
      }
      const now = s.now();
      applyRoute(result, from, now);
      set({ status: 'navigating', startedAt: now, lastRerouteAt: null, rerouteCount: 0, lastFix: from });
      runtime.lastFix = from;
      s.onSessionChange(true, destination.name);
      const { route, progress } = get();
      if (route && progress) speakDue(route, progress);
      report(UnitNavigationState.Started);
      return true;
    },

    handleFix: (fix) => {
      const state = get();
      const { route } = state;
      if (!route || (state.status !== 'navigating' && state.status !== 'arrived')) return;
      runtime.lastFix = fix;
      const s = services();
      const now = s.now();
      const progress = computeProgress(route, fix, state.progress);
      const offRoute = updateOffRoute(state.offRoute, progress, fix);
      const remaining = remainingToLeg(route, progress, state.activeLegIndex);
      set({ progress, lastFix: fix, offRoute, banner: currentBanner(route, progress), legDurationRemaining: remaining.seconds, legDistanceRemaining: remaining.meters, etaAt: now + remaining.seconds * 1000 });

      if (state.status === 'arrived') return;

      if (hasArrived(route, progress, fix, s.arrivalRadiusMeters() || DEFAULT_ARRIVAL_RADIUS_METERS, state.activeLegIndex)) {
        set({ status: 'arrived' });
        report(UnitNavigationState.Arrived);
        return;
      }

      // Route navigation: OffRoute deviation after 30 s off the planned line (once per episode).
      if (offRoute.offRoute) {
        runtime.offRouteSince = runtime.offRouteSince ?? now;
        const destination = state.destination;
        if (destination?.kind === 'route' && !runtime.deviationRecorded && now - runtime.offRouteSince >= OFF_ROUTE_DEVIATION_MS) {
          runtime.deviationRecorded = true;
          s.recordOffRoute({ routeInstanceId: destination.routeInstanceId, latitude: fix.latitude, longitude: fix.longitude, distanceMeters: progress.distanceFromRoute });
        }
        if (!state.rerouting && canReroute(now, state.lastRerouteAt, state.rerouteCount)) void get().reroute(fix);
        return;
      }
      runtime.offRouteSince = null;
      runtime.deviationRecorded = false;

      speakDue(route, progress);

      const meta = state.meta;
      if (meta?.isTrafficAware && !state.rerouting && now - meta.fetchedAt >= TRAFFIC_REFRESH_MS && canReroute(now, state.lastRerouteAt, 0)) {
        void get().reroute(fix);
        return;
      }

      if (shouldReportProgress(runtime.lastReport, now, now + remaining.seconds * 1000)) report(UnitNavigationState.Progress);
    },

    reroute: async (fix) => {
      const state = get();
      const from = fix ?? runtime.lastFix ?? services().currentFix();
      if (!state.destination || !from || state.rerouting) return false;
      const s = services();
      const generation = runtime.generation;
      const now = s.now();
      const counted = state.offRoute.offRoute;
      set({ rerouting: true, lastRerouteAt: now, rerouteCount: counted ? state.rerouteCount + 1 : state.rerouteCount });
      let result: NavigationRouteResult | null = null;
      try {
        result = await fetchRoute(state.destination, from);
      } catch (error) {
        s.log('warn', 'Navigation reroute failed; following the last route', error);
      }
      if (generation !== runtime.generation) return false;
      if (!isNavigable(result)) {
        set({ rerouting: false, usingLastRoute: true });
        return false;
      }
      applyRoute(result, from, s.now());
      set({ rerouting: false });
      if (counted) speak(s.text('rerouted'));
      report(UnitNavigationState.Rerouted);
      return true;
    },

    continueToNextLeg: () => {
      const state = get();
      if (!state.route || state.status !== 'arrived') return;
      if (state.activeLegIndex + 1 >= state.route.legs.length) {
        get().stop();
        return;
      }
      const reached = state.meta?.legStops[state.activeLegIndex]?.routeInstanceStopId;
      if (reached) runtime.completedStops.add(reached);
      set({ status: 'navigating', activeLegIndex: state.activeLegIndex + 1 });
      runtime.lastReport = null;
      report(UnitNavigationState.Progress);
    },

    resumeAfterArrival: () => {
      if (get().status === 'arrived') set({ status: 'navigating' });
    },

    stop: () => {
      const state = get();
      if (state.status === 'idle') return;
      const wasActive = state.status === 'navigating' || state.status === 'arrived';
      if (wasActive) report(UnitNavigationState.Ended);
      services().voice.stop();
      resetRuntime();
      set({ ...IDLE });
      if (wasActive) services().onSessionChange(false);
    },

    setMuted: (muted) => {
      services().preferences.setMuted(muted);
      if (muted) services().voice.stop();
      set({ muted });
    },
  };
});

/** Resets the store between tests. */
export const resetNavigationStoreForTests = (): void => {
  resetRuntime();
  useNavigationStore.setState({ ...IDLE, muted: false });
};
