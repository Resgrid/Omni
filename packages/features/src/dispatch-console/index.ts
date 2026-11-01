// Dispatch console (omni-plan §7.11; Dispatch baseline home/home.web + components/dispatch-console): panels, actions,
// multi-select, call ticker, PTT, map, and 1/2/3-column layouts by form factor. Route file (the variant's home):
//   export { default } from '@resgrid/features/dispatch-console/screens/dispatch-console';

// Screens
export { default as DispatchConsoleScreen, type DispatchConsoleScreenProps } from './screens/dispatch-console';

// Components
export { ActionsPanel, type ActionsPanelProps, type ConsoleActionHandlers } from './components/actions-panel';
export { ActiveCallFilterBanner, type ActiveCallFilterBannerProps } from './components/active-call-filter-banner';
export { ActiveCallsPanel, type ActiveCallsPanelProps, CHECK_IN_POLL_MS } from './components/active-calls-panel';
export { ActivityPanel, type ActivityPanelProps } from './components/activity-panel';
export { AddNoteSheet, type AddNoteSheetProps } from './components/add-note-sheet';
export { AddResourcesSheet, type AddResourcesSheetProps, buildAddResourcesRequest } from './components/add-resources-sheet';
export { ConsoleCallCard, type ConsoleCallCardProps } from './components/console-call-card';
export { ConsoleMap, type ConsoleMapProps } from './components/console-map';
export { ConsolePersonnelStatusSheet, type ConsolePersonnelStatusSheetProps, ConsoleUnitStatusSheet, type ConsoleUnitStatusSheetProps } from './components/console-status-sheets';
export { MapPanel, type MapPanelProps } from './components/map-panel';
export { NotesPanel, type NotesPanelProps } from './components/notes-panel';
export { PanelFrame, type PanelFrameProps, PanelIconButton } from './components/panel-frame';
export { PersonnelPanel, type PersonnelPanelProps } from './components/personnel-panel';
export { PttPanel, type PttPanelProps } from './components/ptt-panel';
export { ConsolePersonnelRow, ConsoleUnitRow, UnitCrewLine } from './components/resource-rows';
export { ResourcesPanel, type ResourcesPanelProps } from './components/resources-panel';
export { StatsHeader, type StatsHeaderProps } from './components/stats-header';
export { UnitsPanel, type UnitsPanelProps } from './components/units-panel';
export { ViewToggles } from './components/view-toggles';

// View state and hooks
export { CONSOLE_PERSONNEL_EVENTS, CONSOLE_UNIT_EVENTS, refreshSelectedCall, useConsoleData } from './hooks/use-console-data';
export { type ConsoleState, MAX_LOG_ENTRIES, useConsoleStore } from './hooks/use-console-store';
export { DASHBOARD_VIEW_STORE_NAME, type DashboardViewState, selectCardCollapsed, useDashboardViewStore } from './hooks/use-dashboard-view-store';
export { usePendingPersonnelIds, usePendingUnitIds } from './hooks/use-pending-resource-ids';
export { useRadioLog } from './hooks/use-radio-log';
export { type SelectedCall, useSelectedCall } from './hooks/use-selected-call';

// Pure helpers
export { commonStatusKey, type CommonUnitStatusOption, resolveCommonUnitStatusOptions } from './lib/bulk-status';
export {
  type ConsoleCallFilter,
  filterConsoleCalls,
  filterConsolePersonnel,
  filterConsoleUnits,
  getUnitCrew,
  isPersonOnCall,
  isUnitOnCall,
  plainText,
  type ResourceFilterOptions,
  type UnitCrew,
} from './lib/console-filters';
export { type ConsoleLayout, resolveConsoleLayout } from './lib/console-layout';
export { computeConsoleStats, type ConsoleStats, isPersonAvailable, isPersonOnDuty, isUnitAvailable } from './lib/console-stats';
export type { ActivityLogEntry, ConsoleTab, DashboardCardKey, RadioLogEntry } from './lib/console-types';

// Nav and routes
export { dispatchConsoleNav, type FeatureNavEntry } from './nav';
export { DISPATCH_CONSOLE_ROUTE_PATTERNS, dispatchConsoleRoutes } from './routes';
