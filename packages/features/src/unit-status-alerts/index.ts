// @resgrid/features/unit-status-alerts — unit status timers (a unit sitting in a status longer than the department
// allows), shown by BigBoard (dashboard Units and Unit Alerts widgets), Dispatch (console tile, tab and unit rows) and
// Unit (its own timer on the status console, the shell banner and the notifications scheduled for the background). No
// screens and no routes: the timer rules, the sync lifecycle, the alert list, the acknowledge sheet and the row badge the
// other features share. Depends on data, department-config, realtime, auth, i18n and ui only, so any feature can import
// it without a cycle.
//
// Re-exported through one statement: Oxlint's readable spacing wants a blank line between top-level statements, which
// the export sorter removes.
import { UnitAlertAcknowledgeSheet, type UnitAlertAcknowledgeSheetProps } from './components/unit-alert-acknowledge-sheet';
import { UnitAlertBadge, type UnitAlertBadgeProps } from './components/unit-alert-badge';
import { UnitAlertList, type UnitAlertListProps } from './components/unit-alert-list';
import { UNIT_ALERT_REEVALUATE_MS, type UnitAlertsThresholds, type UnitAlertsView, useUnitAlerts, useUnitAlertsByUnit, useUnitAlertThresholds } from './hooks/use-unit-alerts';
import { getUnitAlertsSyncHolders, retainUnitAlertsSync, type UnitAlertsSyncOptions, useIsUnitAlertsEnabled, useUnitAlertsSync } from './hooks/use-unit-alerts-sync';
import { UNIT_TIMER_TICK_MS, type UnitStatusTimerScheduleView, type UnitStatusTimerView, useUnitStatusTimer, useUnitStatusTimerSchedule } from './hooks/use-unit-status-timer';

// Pure helpers
export * from './lib/unit-status-alerts';

// Components and hooks
export {
  getUnitAlertsSyncHolders,
  retainUnitAlertsSync,
  UNIT_ALERT_REEVALUATE_MS,
  UNIT_TIMER_TICK_MS,
  UnitAlertAcknowledgeSheet,
  type UnitAlertAcknowledgeSheetProps,
  UnitAlertBadge,
  type UnitAlertBadgeProps,
  UnitAlertList,
  type UnitAlertListProps,
  type UnitAlertsSyncOptions,
  type UnitAlertsThresholds,
  type UnitAlertsView,
  type UnitStatusTimerScheduleView,
  type UnitStatusTimerView,
  useIsUnitAlertsEnabled,
  useUnitAlerts,
  useUnitAlertsByUnit,
  useUnitAlertsSync,
  useUnitAlertThresholds,
  useUnitStatusTimer,
  useUnitStatusTimerSchedule,
};
