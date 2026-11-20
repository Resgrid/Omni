// @resgrid/features/unit-status — Unit's status console (omni-plan §7.11): sidebar content and the full-screen MDT console.
// Register the sidebar from the Unit root layout:
//   registerSidebarContent('unit-status', (props) => <UnitStatusSidebar {...props} onClearActiveCall={clearActiveCall} />);
// Route file for /console: export { default } from '@resgrid/features/unit-status/screens/unit-console';
//
// The status timer and call route pieces are re-exported through one statement: Oxlint's readable spacing wants a blank
// line between top-level statements, which the export sorter removes.
import { callRouteActionKey, CallRouteDetailAction, CallRouteStrip, type CallRouteStripProps } from './components/call-route-actions';
import { CallRouteLauncher } from './components/call-route-launcher';
import { type RouteConflictChoice, RouteConflictDialog, type RouteConflictDialogProps } from './components/route-conflict-dialog';
import { SetActiveCallButton } from './components/set-active-call-button';
import { StatusTimerBanner, type StatusTimerBannerProps } from './components/status-timer-banner';
import { StatusTimerCard, type StatusTimerCardProps } from './components/status-timer-card';
import { StatusTimerNotifications } from './components/status-timer-notifications';
import { type CallRouteRun, type CallRouteState, useCallRoute } from './hooks/use-call-route';
import { type CallRouteConflict, isRunGoing, onCallRouteLaunchRequested, requestCallRouteLaunch, resetCallRouteLaunchForTests, runOfCall, runScreenPath, useCallRouteLaunchStore } from './lib/call-route-launch';
import { timerToneColors, unitTimerNotifications, type UnitTimerText, unitTimerText, type UnitTimerTone } from './lib/status-timer-text';
import { registerUnitStatusCallDetailAction, UnitCallDetailActions } from './register';

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

// Status timer (the console card, the shell banner and the notifications while the app is in the background), "Set Active"
// on a call's detail, and a call's pre-defined route (Core M0322: the launcher overlay, the card strip, the detail action)
export {
  callRouteActionKey,
  type CallRouteConflict,
  CallRouteDetailAction,
  CallRouteLauncher,
  type CallRouteRun,
  type CallRouteState,
  CallRouteStrip,
  type CallRouteStripProps,
  isRunGoing,
  onCallRouteLaunchRequested,
  registerUnitStatusCallDetailAction,
  requestCallRouteLaunch,
  resetCallRouteLaunchForTests,
  type RouteConflictChoice,
  RouteConflictDialog,
  type RouteConflictDialogProps,
  runOfCall,
  runScreenPath,
  SetActiveCallButton,
  StatusTimerBanner,
  type StatusTimerBannerProps,
  StatusTimerCard,
  type StatusTimerCardProps,
  StatusTimerNotifications,
  timerToneColors,
  UnitCallDetailActions,
  unitTimerNotifications,
  type UnitTimerText,
  unitTimerText,
  type UnitTimerTone,
  useCallRoute,
  useCallRouteLaunchStore,
};
