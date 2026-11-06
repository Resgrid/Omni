import { type RouteIdCheck, routePathWithId } from '@resgrid/core/navigation/route-paths';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Weather alert routes. `/weather-alerts/[id]` is canonical for every variant (omni-plan §5.3.4) and replaces
 * `/weather-alert/[id]` and `/weather-alert-detail`; settings exist only where `capabilities.weatherAlerts.admin`.
 */
export const WEATHER_ALERTS_ROUTE_PATTERNS = {
  list: '/weather-alerts',
  detail: '/weather-alerts/[id]',
  settings: '/weather-alerts/settings',
} as const;

/** An alert id that `isSafeRouteId` accepts and that is not the settings page's segment. */
const isAlertId: RouteIdCheck = (id) => isSafeRouteId(id) && id !== 'settings';

export const weatherAlertsRoutes = {
  list: (): string => '/weather-alerts',
  /** Null (reported) for a refused alert id. */
  detail: (alertId: string): string | null => routePathWithId('weather_alerts.detail', alertId, (id) => `/weather-alerts/${id}`, isAlertId),
  settings: (): string => '/weather-alerts/settings',
} as const;
