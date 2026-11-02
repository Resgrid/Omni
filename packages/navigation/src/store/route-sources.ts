import { type ApiContext, getCallRoute, getInstanceDirections, getRoute } from '@resgrid/api';
import { type RouteDirectionsResultData, type RouteResultData, RoutingProfile } from '@resgrid/models';

import type { NavFix } from '../engine/progress';
import { parseNavRoute } from '../engine/route-model';
import type { NavigationRouteResult, NavigationRouteSource } from './services';

/** Providers whose routes carry navigation-grade instructions (MapLibre plan D26). */
const NAVIGATION_PROVIDERS = new Set(['valhalla', 'mapbox']);

const headingOf = (fix: NavFix): number | undefined => (fix.heading !== null && Number.isFinite(fix.heading) && fix.heading >= 0 ? Math.round(fix.heading) : undefined);

/** A Routing/GetRoute or GetCallRoute answer; an empty `Data` (no provider) means no route was found. */
export const fromRouteResult = (data: RouteResultData | null | undefined): NavigationRouteResult | null => {
  if (!data?.Provider) return null;
  return {
    route: parseNavRoute(data.Route, data.Geometry),
    provider: data.Provider,
    attribution: data.Attribution ?? null,
    isTrafficAware: data.IsTrafficAware === true,
    vehicleRestricted: data.VehicleRestricted === true,
    vehicleLimitsEnforced: data.VehicleLimitsEnforced ?? null,
    navigationAvailable: data.NavigationAvailable === true && data.IsEstimate !== true,
    incidents: data.Incidents ?? [],
  };
};

/** Live instance directions; navigation-grade only when routed live by Valhalla or Mapbox with instructions. */
export const fromDirectionsResult = (data: RouteDirectionsResultData | null | undefined): NavigationRouteResult | null => {
  if (!data) return null;
  const route = parseNavRoute(data.Route, data.Geometry);
  const provider = data.Provider ?? null;
  return {
    route,
    provider,
    attribution: data.Attribution ?? null,
    isTrafficAware: data.IsTrafficAware === true,
    vehicleRestricted: data.VehicleRestricted === true,
    vehicleLimitsEnforced: null,
    navigationAvailable: data.IsLive === true && data.IsEstimate !== true && provider !== null && NAVIGATION_PROVIDERS.has(provider) && route !== null && route.hasInstructions,
    incidents: data.Incidents ?? [],
    legs: data.Legs ?? [],
  };
};

export interface ServerRouteSourceOptions {
  getApiContext: () => ApiContext | null;
  /** App language for instructions (`en`, `de`…). */
  getLanguage: () => string;
  /** Metric instructions. */
  isMetric: () => boolean;
  /** The install routes with live traffic (config `RoutingSupportsTraffic`). */
  supportsTraffic: () => boolean;
}

const requireContext = (options: ServerRouteSourceOptions): ApiContext => {
  const ctx = options.getApiContext();
  if (!ctx) throw new Error('Navigation needs a signed-in API context.');
  return ctx;
};

/** Routes from the Resgrid server only (no provider is ever called from the app). Reroutes bypass the cache. */
export const createServerRouteSource = (options: ServerRouteSourceOptions): NavigationRouteSource => ({
  toCall: async ({ callId, from, unitId }) => {
    const result = await getCallRoute(requireContext(options), {
      callId,
      latitude: from.latitude,
      longitude: from.longitude,
      heading: headingOf(from),
      ...(unitId !== null ? { unitId } : {}),
      navigation: true,
      language: options.getLanguage(),
      metric: options.isMetric(),
    });
    return fromRouteResult(result?.Data);
  },
  toRouteStops: async ({ routeInstanceId, from }) => {
    const result = await getInstanceDirections(requireContext(options), {
      instanceId: routeInstanceId,
      latitude: from.latitude,
      longitude: from.longitude,
      heading: headingOf(from),
      navigation: true,
      language: options.getLanguage(),
      metric: options.isMetric(),
    });
    return fromDirectionsResult(result?.Data);
  },
  toPoint: async ({ latitude, longitude, from, unitId }) => {
    const result = await getRoute(requireContext(options), {
      Points: [
        { Latitude: from.latitude, Longitude: from.longitude, Heading: headingOf(from) ?? null, IsStop: true },
        { Latitude: latitude, Longitude: longitude, IsStop: true },
      ],
      Profile: options.supportsTraffic() ? RoutingProfile.DrivingTraffic : RoutingProfile.Driving,
      UnitId: unitId,
      Steps: true,
      Navigation: true,
      Language: options.getLanguage(),
      Metric: options.isMetric(),
    });
    return fromRouteResult(result?.Data);
  },
});
