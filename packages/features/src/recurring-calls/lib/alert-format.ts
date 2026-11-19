import { RecurringCallAlertKind, type RecurringCallAlertResultData } from '@resgrid/models';

/** How loudly an alert reads: no call (error), a call short of resources (warning), or a dispatcher's turn (info). */
export type AlertTone = 'error' | 'warning' | 'info';

const KIND_LABEL_KEYS = new Map<number, string>([
  [RecurringCallAlertKind.CreateFailed, 'recurring_calls.alerts.kind_create_failed'],
  [RecurringCallAlertKind.Missed, 'recurring_calls.alerts.kind_missed'],
  [RecurringCallAlertKind.NoResources, 'recurring_calls.alerts.kind_no_resources'],
  [RecurringCallAlertKind.ResourcesUnavailable, 'recurring_calls.alerts.kind_resources_unavailable'],
  [RecurringCallAlertKind.DispatchDue, 'recurring_calls.alerts.kind_dispatch_due'],
]);

/** What happened, by the alert's kind id (a kind added later reads as a plain alert). */
export const alertKindLabelKey = (alert: Pick<RecurringCallAlertResultData, 'KindId'>): string => KIND_LABEL_KEYS.get(alert.KindId) ?? 'recurring_calls.alerts.kind_other';

const REASON_LABEL_KEYS = new Map<string, string>([
  ['NoneChosen', 'recurring_calls.alerts.reason_none_chosen'],
  ['NoneAvailable', 'recurring_calls.alerts.reason_none_available'],
  ['SaveFailed', 'recurring_calls.alerts.reason_save_failed'],
  ['DepartmentUnavailable', 'recurring_calls.alerts.reason_department_unavailable'],
]);

/** Why, when Core gave a reason code this app words; null otherwise. */
export const alertReasonLabelKey = (alert: Pick<RecurringCallAlertResultData, 'Reason'>): string | null => (alert.Reason ? (REASON_LABEL_KEYS.get(alert.Reason) ?? null) : null);

export const alertTone = (alert: Pick<RecurringCallAlertResultData, 'KindId'>): AlertTone =>
  alert.KindId === RecurringCallAlertKind.DispatchDue ? 'info' : alert.KindId === RecurringCallAlertKind.ResourcesUnavailable ? 'warning' : 'error';

/** The units and members left off the call, by name ("Medic 2, J. Smith"). */
export const unavailableNames = (alert: Pick<RecurringCallAlertResultData, 'UnavailableUnits' | 'UnavailablePeople'>): string =>
  [...(alert.UnavailableUnits ?? []), ...(alert.UnavailablePeople ?? [])].map((resource) => resource.Name?.trim() || resource.Id).join(', ');

/** Core CallStates.Pending: a held call waits as pending until a dispatcher sends it. */
export const PENDING_CALL_STATE = 8;

/** The alert's call is held as pending (nobody could be sent). */
export const isHeldCall = (alert: Pick<RecurringCallAlertResultData, 'CallId' | 'CallState'>): boolean => !!alert.CallId && alert.CallState === PENDING_CALL_STATE;
