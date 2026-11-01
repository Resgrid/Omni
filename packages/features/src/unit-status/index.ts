// @resgrid/features/unit-status — Unit's status console (omni-plan §7.11): sidebar content and the full-screen MDT console.
// Register the sidebar from the Unit root layout:
//   registerSidebarContent('unit-status', (props) => <UnitStatusSidebar {...props} onClearActiveCall={clearActiveCall} />);
// Route file for /console: export { default } from '@resgrid/features/unit-status/screens/unit-console';

// Screens
export { default as UnitConsoleScreen, type UnitConsoleScreenProps } from './screens/unit-console';

// Components
export { ActiveCallCard, type ActiveCallCardProps } from './components/active-call-card';
export { ActiveCallSheet, type ActiveCallSheetProps } from './components/active-call-sheet';
export { CHECK_IN_SUMMARY_POLL_MS, CheckInSummary, type CheckInSummaryProps } from './components/check-in-summary';
export { CurrentStatusCard, type CurrentStatusCardProps } from './components/current-status-card';
export { QuickActions, type QuickActionsProps } from './components/quick-actions';
export { SharedSessionCard, type SharedSessionCardProps } from './components/shared-session-card';
export { StatusButtons, type StatusButtonsProps } from './components/status-buttons';
export { UnitStatusPanel, type UnitStatusPanelProps } from './components/unit-status-panel';
export { UnitStatusSidebar, type UnitStatusSidebarProps } from './components/unit-status-sidebar';
export { UnitSummaryCard, type UnitSummaryCardProps } from './components/unit-summary-card';

// Hooks and helpers
export { type ActiveUnitData, useActiveUnit } from './hooks/use-active-unit';
export { callDestinationTarget, callLocationTarget, isUsablePoint } from './lib/call-location';
export { type ConsoleDensity, type ConsoleMetrics, consoleMetrics } from './lib/console-layout';
export { QUICK_ACTION_FLAGS, QUICK_ACTIONS, type QuickAction, type QuickActionGates, type QuickActionId, visibleQuickActions } from './lib/quick-actions';
export { resolveUnitStatusDisplay, STATE_STYLE_COLORS, statusStyleColor, type UnitStatusDisplay, type UnitStatusDisplayInput } from './lib/status-display';

// Routes and nav
export { type FeatureNavEntry, unitStatusNav } from './nav';
export { UNIT_STATUS_ROUTE_PATTERNS, unitStatusRoutes } from './routes';
