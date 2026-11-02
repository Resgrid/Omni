import type { RouteDirectionLegData, RouteIncidentData } from '@resgrid/models';

import type { NavFix } from '../engine/progress';
import type { NavRoute } from '../engine/route-model';

/**
 * What the navigation session needs from the rest of the app, injected once by the app shell (`configureNavigation`) so
 * the store stays testable and never reaches for stores, auth or native modules itself.
 */

/** A route ready to follow, from any of the three server endpoints. */
export interface NavigationRouteResult {
  route: NavRoute | null;
  provider: string | null;
  attribution: string | null;
  isTrafficAware: boolean;
  vehicleRestricted: boolean;
  vehicleLimitsEnforced: string | null;
  /** The server says this route may be used for in-app navigation (Valhalla / Mapbox, navigation enabled). */
  navigationAvailable: boolean;
  incidents: RouteIncidentData[];
  /** Route navigation: one entry per leg (the stop it arrives at). */
  legs?: RouteDirectionLegData[];
}

export interface NavigationRouteSource {
  toCall(input: { callId: number; from: NavFix; unitId: number | null }): Promise<NavigationRouteResult | null>;
  toRouteStops(input: { routeInstanceId: string; from: NavFix }): Promise<NavigationRouteResult | null>;
  toPoint(input: { latitude: number; longitude: number; from: NavFix; unitId: number | null }): Promise<NavigationRouteResult | null>;
}

/** One live-ETA report (MapLibre plan §9.4); `state` is Core's `UnitNavigationStates`. */
export interface NavigationProgressReport {
  unitId: number;
  callId: number | null;
  routeInstanceId: string | null;
  routeInstanceStopId: string | null;
  state: number;
  etaUtc: string;
  remainingSeconds: number;
  remainingMeters: number;
  isTrafficAware: boolean;
  provider: string | null;
  /** Epoch ms the report describes; stale reports are dropped, not replayed. */
  at: number;
}

export interface NavigationVoice {
  speak(text: string): void;
  stop(): void;
}

export interface NavigationPreferences {
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  hasAcknowledgedSafetyNotice(): boolean;
  acknowledgeSafetyNotice(): void;
}

export interface NavigationServices {
  routes: NavigationRouteSource;
  voice: NavigationVoice;
  preferences: NavigationPreferences;
  /** Queues an ETA report (the app sends it through the outbox). */
  reportProgress(report: NavigationProgressReport): void;
  /** Records an OffRoute deviation for a route instance (online, best effort). */
  recordOffRoute(input: { routeInstanceId: string; latitude: number; longitude: number; distanceMeters: number }): void;
  /** The device's latest position, or null. */
  currentFix(): NavFix | null;
  /** Arrival radius in metres (department setting 122 when the server sends it; 0 = default). */
  arrivalRadiusMeters(): number;
  /** Session started (true, with the destination's name when known) or ended (false): location profile, notification text. */
  onSessionChange(active: boolean, destinationName?: string | null): void;
  /** Short phrases the store uses itself: spoken `rerouted`, the `navigating_to` notification text. */
  text(key: 'rerouted' | 'navigating_to' | 'navigating', values?: Record<string, string>): string;
  log(level: 'info' | 'warn', message: string, error?: unknown): void;
  now(): number;
}

const memoryPreferences = (): NavigationPreferences => {
  let muted = false;
  let acknowledged = false;
  return {
    isMuted: () => muted,
    setMuted: (value) => {
      muted = value;
    },
    hasAcknowledgedSafetyNotice: () => acknowledged,
    acknowledgeSafetyNotice: () => {
      acknowledged = true;
    },
  };
};

const unconfigured = async (): Promise<null> => null;

const createDefaultServices = (): NavigationServices => ({
  routes: { toCall: unconfigured, toRouteStops: unconfigured, toPoint: unconfigured },
  voice: { speak: () => undefined, stop: () => undefined },
  preferences: memoryPreferences(),
  reportProgress: () => undefined,
  recordOffRoute: () => undefined,
  currentFix: () => null,
  arrivalRadiusMeters: () => 0,
  onSessionChange: () => undefined,
  text: () => '',
  log: () => undefined,
  now: () => Date.now(),
});

let services: NavigationServices = createDefaultServices();

/** Replaces some or all services (the app shell at startup; tests). */
export const setNavigationServices = (overrides: Partial<NavigationServices>): void => {
  services = { ...services, ...overrides };
};

export const getNavigationServices = (): NavigationServices => services;

export const resetNavigationServicesForTests = (): void => {
  services = createDefaultServices();
};
