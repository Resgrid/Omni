// @resgrid/features/route-plans — route plan previews for every app that picks or runs routes (Core M0322,
// `capabilities.routes.preview`): the call form and call detail (a call's pre-defined route), the Unit routes list and
// Dispatch's routes area open `/route-plans/[id]`; `RoutePlanPreview` embeds the same view anywhere. Maps come from the
// shell's route map renderer (`UnitRoutesMapProvider`), so this module never imports a renderer.
// Route files re-export the screen: `export { RoutePlanPreviewScreen as default } from '@resgrid/features/route-plans';`.
// One export statement: Oxlint's readable spacing wants a blank line between top-level statements, which the export sorter removes.
import { RoutePlanPreview, type RoutePlanPreviewProps } from './components/route-plan-preview';
import { endpointText, planPreviewLine, ROUTE_END_COLOR, ROUTE_START_COLOR, routeEndpointMarkers, type RouteEndpointPreview, routeEndpointsOf, routePlanStatusLook, routingProfileKey } from './lib/route-plan-preview';
import { type FeatureNavEntry, routePlansNav } from './nav';
import { ROUTE_PLANS_ROUTE_PATTERNS, routePlansRoutes } from './routes';
import RoutePlanPreviewScreen, { type RoutePlanPreviewScreenProps } from './screens/route-plan-preview';

export {
  endpointText,
  type FeatureNavEntry,
  planPreviewLine,
  ROUTE_END_COLOR,
  ROUTE_PLANS_ROUTE_PATTERNS,
  ROUTE_START_COLOR,
  routeEndpointMarkers,
  type RouteEndpointPreview,
  routeEndpointsOf,
  RoutePlanPreview,
  type RoutePlanPreviewProps,
  RoutePlanPreviewScreen,
  type RoutePlanPreviewScreenProps,
  routePlansNav,
  routePlansRoutes,
  routePlanStatusLook,
  routingProfileKey,
};
