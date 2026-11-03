import { isApiError, V4FailureError } from '@resgrid/api';
import type { IncidentCommandSummary } from '@resgrid/models';

import { CallState } from './call-time';
import { isFinalRefusal, MAX_SERVER_MESSAGE_LENGTH, refusalText } from './server-refusal';

/** The states a call can be closed as (CallStates 1–7), in the order the legacy sheets list them. */
export const CLOSE_CALL_TYPES = [
  { value: CallState.Closed, labelKey: 'call_detail.close_call_types.closed' },
  { value: CallState.Cancelled, labelKey: 'call_detail.close_call_types.cancelled' },
  { value: CallState.Unfounded, labelKey: 'call_detail.close_call_types.unfounded' },
  { value: CallState.Founded, labelKey: 'call_detail.close_call_types.founded' },
  { value: CallState.Minor, labelKey: 'call_detail.close_call_types.minor' },
  { value: CallState.Transferred, labelKey: 'call_detail.close_call_types.transferred' },
  { value: CallState.FalseAlarm, labelKey: 'call_detail.close_call_types.false_alarm' },
] as const;

/**
 * The reason the server gave for refusing a close, when it gave one (Dispatch `getCallCloseErrorMessage`): Core
 * answers a refused close (e.g. an active incident command) with a plain-text 400 or a failure envelope. Null for
 * network/timeout/5xx failures, a timeout or rate-limit 4xx (408/429: sending again can work), empty bodies and HTML
 * pages, so the caller falls back to its own text.
 */
export function getCallCloseErrorMessage(error: unknown): string | null {
  // A failure envelope carries no reason written for a person (its message is generic).
  if (error instanceof V4FailureError || !isApiError(error) || !isFinalRefusal(error)) return null;
  const text = refusalText(error);

  if (!text || text.startsWith('<') || text.length > MAX_SERVER_MESSAGE_LENGTH) return null;

  return text;
}

/** IncidentCommandStatus: 0 Active, 1 Closed. */
export const INCIDENT_COMMAND_ACTIVE = 0;

export const isActiveCommandFor = (summary: Pick<IncidentCommandSummary, 'CallId' | 'Status'>, callId: string): boolean => String(summary.CallId) === String(callId) && summary.Status === INCIDENT_COMMAND_ACTIVE;
