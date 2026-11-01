// @resgrid/features/dashboard — BigBoard's home and signature module (omni-plan §7.11): the widget board on a custom
// grid (Gesture Handler + Reanimated), 14 widget types, per-device layout and widget settings, the configure screen and
// the OpenWeather client (integrations/openweather). Route files re-export the screens, e.g.
//   export { default } from '@resgrid/features/dashboard/screens/dashboard';

// Screens
export { default as ConfigureDashboardScreen, type ConfigureDashboardScreenProps } from './screens/configure-dashboard';
export { default as DashboardScreen, type DashboardScreenProps } from './screens/dashboard';

// Components
export { AddWidgetMenu, type AddWidgetMenuProps } from './components/add-widget-menu';
export { DashboardGrid, type DashboardGridProps } from './components/dashboard-grid';
export { DashboardHeaderActions, type DashboardHeaderActionsProps } from './components/dashboard-header-actions';
export { UnitAlertAcknowledgeSheet, type UnitAlertAcknowledgeSheetProps } from './components/unit-alert-acknowledge-sheet';
export { WidgetContainer, type WidgetContainerProps } from './components/widget-container';
export { WIDGET_COMPONENTS, WidgetRenderer, type WidgetRendererProps } from './components/widget-renderer';
export type { WidgetProps } from './components/widgets/types';

// State (per device; frozen persisted names `dashboard-widgets` and `widget-settings`)
export { DASHBOARD_LAYOUT_STORE_NAME, type DashboardLayoutState, type DashboardWidget, normalizeLayout, useDashboardStore } from './hooks/use-dashboard-store';
export { type DashboardViewState, useDashboardViewStore } from './hooks/use-dashboard-view-store';
export { type DashboardConfigState, setDashboardDepartmentConfig, useDashboardConfig, useDashboardConfigStore } from './hooks/use-department-config';
export { useWidgetSettings, useWidgetSettingsStore, WIDGET_SETTINGS_STORE_NAME, type WidgetSettingsState } from './hooks/use-widget-settings-store';
export { getDashboardKv, setDashboardStorage } from './lib/storage';

// Hooks
export { useDashboardData } from './hooks/use-dashboard-data';
export { useGridConfig } from './hooks/use-grid-config';
export { UNIT_ALERT_REEVALUATE_MS, type UnitAlertsView, useUnitAlerts } from './hooks/use-unit-alerts';

// Pure helpers
export * from './lib/grid';
export * from './lib/unit-status-alerts';
export * from './lib/widget-settings';
export * from './lib/widget-types';

// OpenWeather (isolated integration)
export {
  clearWeatherCache,
  fetchWeatherOutlook,
  type ForecastDay,
  getWeatherOutlook,
  OpenWeatherError,
  type OpenWeatherErrorKind,
  type WeatherConditions,
  type WeatherOutlook,
} from './integrations/openweather/openweather-client';
export { useWeatherOutlook, type WeatherOutlookState } from './integrations/openweather/use-weather-outlook';

// Routes and nav
export { dashboardNav, type FeatureNavEntry } from './nav';
export { DASHBOARD_ROUTE_PATTERNS, dashboardRoutes, parseConfigureWidgetParam } from './routes';
