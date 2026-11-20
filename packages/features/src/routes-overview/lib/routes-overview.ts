import { RouteInstanceStatus } from '@resgrid/data';
import { type ActiveRouteInstanceResultData, type RoutePlanResultData, RoutePlanStatus } from '@resgrid/models';

/** Plans in the department's list: Active first, then Paused, Draft and Archived; by name within a status. */
const PLAN_STATUS_ORDER: readonly number[] = [RoutePlanStatus.Active, RoutePlanStatus.Paused, RoutePlanStatus.Draft, RoutePlanStatus.Archived];

const statusRank = (status: number): number => {
  const rank = PLAN_STATUS_ORDER.indexOf(status);

  return rank === -1 ? PLAN_STATUS_ORDER.length : rank;
};

/** The department's plans for the routes area: matching `query` (name, description or unit), Active first, then by name. */
export const sortPlansForOverview = (plans: readonly RoutePlanResultData[], query: string, unitNameOf: (plan: RoutePlanResultData) => string): RoutePlanResultData[] => {
  const needle = query.trim().toLowerCase();
  const matching = needle === '' ? [...plans] : plans.filter((plan) => [plan.Name, plan.Description ?? '', unitNameOf(plan)].some((value) => value.toLowerCase().includes(needle)));

  return matching.sort((a, b) => statusRank(a.RouteStatus) - statusRank(b.RouteStatus) || a.Name.localeCompare(b.Name));
};

/** Running routes: in progress before paused, then the one started first on top. */
export const sortRunningRoutes = (instances: readonly ActiveRouteInstanceResultData[]): ActiveRouteInstanceResultData[] =>
  [...instances].sort((a, b) => {
    const paused = Number(a.Status === RouteInstanceStatus.Paused) - Number(b.Status === RouteInstanceStatus.Paused);

    return paused || (a.ActualStartOn ?? '').localeCompare(b.ActualStartOn ?? '');
  });

/** A running route's progress, 0-100: the server's figure, else stops done of the total. */
export const runningRouteProgress = (instance: Pick<ActiveRouteInstanceResultData, 'ProgressPercent' | 'StopsCompleted' | 'StopsTotal'>): number => {
  const percent = Number.isFinite(instance.ProgressPercent) && instance.ProgressPercent > 0 ? instance.ProgressPercent : instance.StopsTotal > 0 ? (instance.StopsCompleted / instance.StopsTotal) * 100 : 0;

  return Math.max(0, Math.min(100, Math.round(percent)));
};
