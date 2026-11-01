import { formatUtcInDepartmentTime, parseDateISOString } from '@resgrid/core/utils/dates';
import type { DataError } from '@resgrid/data';
import { type WorkOrderChoice, type WorkOrderDetail, WorkOrderStatus } from '@resgrid/models';

// Pure rules for the work order screens (Responder lib/workOrders/status). The server filters `Transitions` for the
// person and re-checks every rule; these only decide which fields a transition asks for and how a refusal reads.

export const isTerminal = (status: number): boolean => status >= WorkOrderStatus.Closed;

/** Not yet finished: requested through on hold. */
export const isOpenStatus = (status: number): boolean => status < WorkOrderStatus.Completed;

export interface TransitionNeeds {
  reason: boolean;
  resolution: boolean;
  cause: boolean;
  verification: boolean;
  duplicateOf: boolean;
  /** Completing with unchecked steps needs an explicit confirmation. */
  confirmTasks: boolean;
}

export const transitionNeeds = (detail: Pick<WorkOrderDetail, 'Order' | 'Input'>, to: number): TransitionNeeds => {
  const from = detail.Order.Status;
  const reopen = isTerminal(from) && to === WorkOrderStatus.Accepted;
  const backFromCompleted = from === WorkOrderStatus.Completed && to === WorkOrderStatus.InProgress;
  const openSteps = (detail.Input?.Content?.Steps ?? []).some((step) => !step.Completed);
  const reasonStatuses: number[] = [WorkOrderStatus.OnHold, WorkOrderStatus.Cancelled, WorkOrderStatus.Rejected, WorkOrderStatus.Duplicate];
  return {
    reason: reopen || backFromCompleted || reasonStatuses.includes(to),
    resolution: to === WorkOrderStatus.Completed,
    cause: to === WorkOrderStatus.Completed,
    verification: to === WorkOrderStatus.Closed,
    duplicateOf: to === WorkOrderStatus.Duplicate,
    confirmTasks: to === WorkOrderStatus.Completed && openSteps,
  };
};

export interface TransitionFields {
  reason: string;
  resolution: string;
  cause: string;
  verification: string;
  duplicateOf: string;
  confirmTasks: boolean;
}

export const BLANK_TRANSITION_FIELDS: TransitionFields = { reason: '', resolution: '', cause: '', verification: '', duplicateOf: '', confirmTasks: false };

/** The first missing required field, or null when the form can be sent. */
export const missingField = (needs: TransitionNeeds, fields: TransitionFields): keyof TransitionFields | null => {
  if (needs.reason && !fields.reason.trim()) return 'reason';
  if (needs.resolution && !fields.resolution.trim()) return 'resolution';
  if (needs.cause && !fields.cause.trim()) return 'cause';
  if (needs.verification && !fields.verification.trim()) return 'verification';
  if (needs.duplicateOf && !fields.duplicateOf.trim()) return 'duplicateOf';
  if (needs.confirmTasks && !fields.confirmTasks) return 'confirmTasks';
  return null;
};

/** Refusal codes with their own message (`workOrders.errors.<code>`); anything else reads as "try again". */
const KNOWN_ERROR_CODES = new Set([
  'AcceptAssignmentFirst',
  'Conflict',
  'IndependentVerificationRequired',
  'InvalidFile',
  'PartBalanceOutstanding',
  'ReadinessProRequired',
  'RevisionConflict',
  'SafetyRequirements',
  'ScanRequired',
  'SpendingApprovalRequired',
  'TasksIncomplete',
  'denied',
  'locked',
  'photo_denied',
  'readiness_required',
  'retry',
]);

/**
 * A refusal as a short code for translation. ProblemDetails carry `work_order_<Code>`; a stale Revision is 409; the
 * Readiness Pro gate is 402; an ADP-protected order needs a grant.
 */
export const workOrderErrorCode = (error: DataError | null | undefined): string => {
  if (!error) return 'retry';
  const type = error.problemType ?? '';
  if (type === 'protected_data_required') return 'locked';
  if (error.status === 402) return 'readiness_required';
  if (type.startsWith('work_order_')) {
    const code = type.slice('work_order_'.length);
    return KNOWN_ERROR_CODES.has(code) ? code : 'retry';
  }
  if (error.status === 409 || error.code === 'conflict') return 'Conflict';
  if (error.status === 401 || error.status === 403 || error.status === 404) return 'denied';
  return 'retry';
};

export const workOrderErrorKey = (code: string): string => `workOrders.errors.${KNOWN_ERROR_CODES.has(code) ? code : 'retry'}`;

/** Someone else changed the order: reload it so the person decides again on what it is now. */
export const isConflictCode = (code: string): boolean => code === 'Conflict' || code === 'RevisionConflict';

/** A local calendar day as the `yyyy-MM-dd` a labor entry carries. */
export const todayKey = (date: Date = new Date()): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Hours typed by the person (comma or dot), 0 < h ≤ 24, two decimals; null when invalid. */
export const parseHours = (text: string): number | null => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 24 ? Math.round(value * 100) / 100 : null;
};

/** A due date is a calendar day: format its date part as is (never shifted through a time zone). */
export const formatDueDate = (value: string | null | undefined, locale?: string): string => {
  if (!value) return '';
  const day = parseDateISOString(String(value).slice(0, 10));
  if (!day) return String(value).slice(0, 10);
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(day);
  } catch {
    return String(value).slice(0, 10);
  }
};

/** Activity and file timestamps are UTC instants. */
export const formatWorkOrderTime = (value: string | null | undefined, locale?: string): string => formatUtcInDepartmentTime(value, null, { dateStyle: 'medium', timeStyle: 'short' }, locale, value ? String(value) : '');

export const choiceName = (list: readonly WorkOrderChoice[] | undefined, value: string | number | null | undefined): string | null =>
  value == null || value === '' ? null : (list?.find((item) => item.Id === String(value))?.Name ?? null);

/** Safe file name part for an attached photo. */
export const photoFileName = (orderNumber: string | undefined): string => `work-order-${(orderNumber || 'photo').replace(/[^A-Za-z0-9._-]+/g, '-')}.jpg`;
