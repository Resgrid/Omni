import { parseUtcMs } from '@resgrid/core/utils/dates';
import { RouteInstanceStatus } from '@resgrid/data';
import { formatDistance, formatDuration } from '@resgrid/features/unit-routes/lib/route-format';
import type { CallExtraDataResultData, CallResultData, CallRouteInstanceResultData, CallRoutePlanResultData, RouteEndpointData } from '@resgrid/models';

/** Core `RouteInstanceStatus` values of a run that is still going. */
const RUNNING_STATUSES: readonly number[] = [RouteInstanceStatus.InProgress, RouteInstanceStatus.Paused];

type CallRouteFields = Partial<Pick<CallResultData, 'RoutePlanId' | 'RoutePlanName'>>;

/** The call's pre-defined route id (Core M0322); null when it has none or the server predates call routes. */
export const callRoutePlanId = (call: CallRouteFields | null | undefined): string | null => {
  const id = call?.RoutePlanId?.trim() ?? '';

  return id === '' ? null : id;
};

/** Core M0322: the call runs a pre-defined route. */
export const callHasRoute = (call: CallRouteFields | null | undefined): boolean => callRoutePlanId(call) !== null;

/**
 * The call's route name: the server's `RoutePlanName` (GetCall, GetActiveCalls), else the name in the routes a call may run
 * (`Routes/GetCallRoutePlans`, the routes store's `callRoutePlans`); empty when unknown.
 */
export const callRouteName = (call: CallRouteFields | null | undefined, plans: readonly Pick<CallRoutePlanResultData, 'RoutePlanId' | 'Name'>[] = []): string => {
  const id = callRoutePlanId(call);

  if (!id) return '';
  const named = call?.RoutePlanName?.trim() ?? '';

  return named || (plans.find((plan) => plan.RoutePlanId === id)?.Name.trim() ?? '');
};

/** The route runs started for a call (`GetCallExtraData` `RouteInstances`, Core M0322); empty from older servers. */
export const callRouteInstancesOf = (extraData: Pick<CallExtraDataResultData, 'RouteInstances'> | null | undefined): CallRouteInstanceResultData[] => extraData?.RouteInstances ?? [];

/** A route run that is still going (in progress or paused). */
export const isCallRouteRunning = (run: Pick<CallRouteInstanceResultData, 'Status'>): boolean => RUNNING_STATUSES.includes(run.Status);

/**
 * The run started last: by `ActualStartOn` (the server sends `RouteInstances` in no stated order). A run that never started
 * counts as older than any that did; between runs with the same start (or none) the later in the list wins.
 */
const latestRun = (runs: readonly CallRouteInstanceResultData[]): CallRouteInstanceResultData | null => {
  let latest: CallRouteInstanceResultData | null = null;
  let latestStart = -Infinity;

  for (const run of runs) {
    const start = parseUtcMs(run.ActualStartOn) ?? -Infinity;

    if (latest === null || start >= latestStart) {
      latest = run;
      latestStart = start;
    }
  }

  return latest;
};

/** The unit's run of the call's route: the one still going, else its latest; null when the unit has not started it. */
export const callRouteInstanceForUnit = (extraData: Pick<CallExtraDataResultData, 'RouteInstances'> | null | undefined, unitId: number | string | null | undefined): CallRouteInstanceResultData | null => {
  if (unitId === null || unitId === undefined || String(unitId) === '') return null;
  const runs = callRouteInstancesOf(extraData).filter((run) => String(run.UnitId) === String(unitId));

  return runs.find(isCallRouteRunning) ?? latestRun(runs);
};

/** The translate function the route wording takes (the one `formatDuration` takes). */
type Translate = Parameters<typeof formatDuration>[1];

/** A route's start or end as text: its name, else its coordinates. */
export const routeEndpointText = (endpoint: Pick<RouteEndpointData, 'Name' | 'Latitude' | 'Longitude'> | null | undefined): string => {
  if (!endpoint) return '';
  const name = endpoint.Name?.trim() ?? '';

  return name || `${Math.round(endpoint.Latitude * 1e5) / 1e5}, ${Math.round(endpoint.Longitude * 1e5) / 1e5}`;
};

/** A route a call may run, in one line: its stops, distance and time ("5 stops · 12.4 km · 25 min"); parts it lacks are left out. */
export const callRoutePlanSummary = (plan: Pick<CallRoutePlanResultData, 'StopsCount' | 'EstimatedDistanceMeters' | 'EstimatedDurationSeconds'>, t: Translate): string =>
  [t('calls.route_stops_count', { count: plan.StopsCount }), formatDistance(plan.EstimatedDistanceMeters), formatDuration(plan.EstimatedDurationSeconds, t)].filter((part) => part !== '').join(' · ');

/** Where a route a call may run starts and ends ("Station 1 → General Hospital"). */
export const callRoutePlanEndpoints = (plan: Pick<CallRoutePlanResultData, 'Start' | 'End'>, t: Translate): string =>
  t('calls.route_start_end', { start: routeEndpointText(plan.Start), end: routeEndpointText(plan.End) });

/** The routes a call may run, by name, narrowed by the search text (name, description, start or end). */
export const filterCallRoutePlans = (plans: readonly CallRoutePlanResultData[], query: string): CallRoutePlanResultData[] => {
  const needle = query.trim().toLowerCase();
  const matches = (plan: CallRoutePlanResultData): boolean => !needle || [plan.Name, plan.Description, plan.Start?.Name, plan.End?.Name].some((value) => !!value && value.toLowerCase().includes(needle));

  return plans.filter(matches).sort((a, b) => a.Name.localeCompare(b.Name));
};
