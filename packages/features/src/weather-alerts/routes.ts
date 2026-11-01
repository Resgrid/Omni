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

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id) || id === 'settings') throw new Error('Unsafe weather alert route id');
  return encodeURIComponent(id);
};

export const weatherAlertsRoutes = {
  list: (): string => '/weather-alerts',
  detail: (alertId: string): string => `/weather-alerts/${encodeId(alertId)}`,
  settings: (): string => '/weather-alerts/settings',
} as const;
