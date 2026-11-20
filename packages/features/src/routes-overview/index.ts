// @resgrid/features/routes-overview — the department's routes, read only (Core M0322, `capabilities.routes.preview`;
// Dispatch's routes area): the plans with their status (a plan opens its preview, `@resgrid/features/route-plans`) and the
// routes units are running with their progress (a run opens read only). Starting, ending and check-ins stay in Unit.
// Route files re-export the screens, e.g. `export { RoutesOverviewScreen as default } from '@resgrid/features/routes-overview';`.
// One export statement: Oxlint's readable spacing wants a blank line between top-level statements, which the export sorter removes.
import { DepartmentRoutePlans } from './components/department-route-plans';
import { RUNNING_ROUTES_POLL_MS, RunningRoutes } from './components/running-routes';
import { runningRouteProgress, sortPlansForOverview, sortRunningRoutes } from './lib/routes-overview';
import { type FeatureNavEntry, routesOverviewNav } from './nav';
import { ROUTES_OVERVIEW_ROUTE_PATTERNS, routesOverviewRoutes } from './routes';
import RouteInstanceViewScreen from './screens/route-instance-view';
import RoutesOverviewScreen from './screens/routes-overview';

export {
  DepartmentRoutePlans,
  type FeatureNavEntry,
  RouteInstanceViewScreen,
  ROUTES_OVERVIEW_ROUTE_PATTERNS,
  routesOverviewNav,
  routesOverviewRoutes,
  RoutesOverviewScreen,
  RUNNING_ROUTES_POLL_MS,
  runningRouteProgress,
  RunningRoutes,
  sortPlansForOverview,
  sortRunningRoutes,
};
