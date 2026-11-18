// Recurring calls (Dispatch, Core M0319/M0320; `capabilities.calls.recurringCalls`): schedules that dispatch a call on a
// pattern, their occurrence calendar with per-occurrence actions, and the alerts dispatchers act on (badge, banner, list,
// push `RCA:`). Mount `RecurringCallAlertsHost` once in the signed-in shell and register `RecurringCallAlertsBanner` as a
// shell banner; `registerRecurringCallsHookPoints()` adds the "created by a recurring call" notice to the call detail.
//
// Re-exported through one statement: Oxlint's readable spacing wants a blank line between top-level statements, which
// the export sorter removes.
import { RecurringCallAlertCard, type RecurringCallAlertCardProps } from './components/recurring-call-alert-card';
import { RecurringCallAlertsBanner, type RecurringCallAlertsBannerProps } from './components/recurring-call-alerts-banner';
import { RecurringCallAlertsHost } from './components/recurring-call-alerts-host';
import { RecurringCallNotice } from './components/recurring-call-notice';
import { ALERTS_FOREGROUND_REFRESH_MS, type OccurrenceActionControls, useIsRecurringCallsEnabled, useOccurrenceActions, useRecurringCallAlertsSync } from './hooks/use-recurring-calls';
import { alertKindLabelKey, alertReasonLabelKey, alertTone, isHeldCall, unavailableNames } from './lib/alert-format';
import { AGENDA_DAYS, agendaRange, agendaWindow, entryKindLabelKey, groupAgenda, occurrenceActionsFor } from './lib/calendar-agenda';
import { readSaveErrors } from './lib/save-errors';
import { describeSaveError, emptyRecurringCallForm, type RecurringCallFormValues, scheduleToFormValues, toRecurringCallInput, validateRecurringCallForm } from './lib/schedule-form';
import { describeMode, describePattern, describeSchedule, formatMinutes, type RecurringCallStatus, recurringCallStatus } from './lib/schedule-format';
import { type FeatureNavEntry, recurringCallsNav } from './nav';
import { registerRecurringCallsHookPoints } from './register';
import { RECURRING_CALLS_ROUTE_PATTERNS, recurringCallsRoutes } from './routes';
import RecurringCallAlertsScreen, { type RecurringCallAlertsScreenProps } from './screens/recurring-call-alerts';
import RecurringCallDetailScreen, { type RecurringCallDetailScreenProps } from './screens/recurring-call-detail';
import RecurringCallFormScreen from './screens/recurring-call-form';
import RecurringCallsScreen, { type RecurringCallsScreenProps } from './screens/recurring-calls';
import RecurringCallsCalendarScreen, { type RecurringCallsCalendarScreenProps } from './screens/recurring-calls-calendar';

export {
  AGENDA_DAYS,
  agendaRange,
  agendaWindow,
  alertKindLabelKey,
  alertReasonLabelKey,
  ALERTS_FOREGROUND_REFRESH_MS,
  alertTone,
  describeMode,
  describePattern,
  describeSaveError,
  describeSchedule,
  emptyRecurringCallForm,
  entryKindLabelKey,
  type FeatureNavEntry,
  formatMinutes,
  groupAgenda,
  isHeldCall,
  type OccurrenceActionControls,
  occurrenceActionsFor,
  readSaveErrors,
  RECURRING_CALLS_ROUTE_PATTERNS,
  RecurringCallAlertCard,
  type RecurringCallAlertCardProps,
  RecurringCallAlertsBanner,
  type RecurringCallAlertsBannerProps,
  RecurringCallAlertsHost,
  RecurringCallAlertsScreen,
  type RecurringCallAlertsScreenProps,
  RecurringCallDetailScreen,
  type RecurringCallDetailScreenProps,
  RecurringCallFormScreen,
  type RecurringCallFormValues,
  RecurringCallNotice,
  RecurringCallsCalendarScreen,
  type RecurringCallsCalendarScreenProps,
  recurringCallsNav,
  recurringCallsRoutes,
  RecurringCallsScreen,
  type RecurringCallsScreenProps,
  type RecurringCallStatus,
  recurringCallStatus,
  registerRecurringCallsHookPoints,
  scheduleToFormValues,
  toRecurringCallInput,
  unavailableNames,
  useIsRecurringCallsEnabled,
  useOccurrenceActions,
  useRecurringCallAlertsSync,
  validateRecurringCallForm,
};
