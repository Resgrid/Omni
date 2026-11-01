import { type DispatchResponseCodeData, type OutstandingRequirementsAlert, type OutstandingRequirementsAlertCall, OutstandingRequirementsAlertKind } from '@resgrid/models';

/**
 * Pure helpers for conditional run cards' awaiting-resources data (Dispatch baseline `lib/run-card-conditions`): the
 * `outstandingRequirementsUpdated` payload and the response code catalog. Kept beside the store so the parsing is unit
 * testable and every surface reads the push the same way.
 */

/**
 * Codes a dispatcher may pick: retired ones stay readable on history but cannot be chosen. Ordered as the department set
 * them up (sort order, then code).
 */
export const activeResponseCodes = (codes: readonly DispatchResponseCodeData[] | null | undefined): DispatchResponseCodeData[] =>
  (codes ?? []).filter((code) => !!code && !code.Retired && !!code.Code).sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0) || a.Code.localeCompare(b.Code));

const toNumberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const toStringOrNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const parseAlertCall = (value: unknown): OutstandingRequirementsAlertCall | null => {
  if (!value || typeof value !== 'object') return null;
  const call = value as Record<string, unknown>;
  const callId = toNumberOrNull(call.callId);
  if (callId === null || callId <= 0) return null;
  return {
    callId,
    callNumber: toStringOrNull(call.callNumber),
    callName: toStringOrNull(call.callName),
    priority: toNumberOrNull(call.priority) ?? 0,
    label: toStringOrNull(call.label),
    responseSeconds: toNumberOrNull(call.responseSeconds),
    ageMinutes: toNumberOrNull(call.ageMinutes) ?? 0,
  };
};

const KNOWN_KINDS: readonly number[] = [OutstandingRequirementsAlertKind.Changed, OutstandingRequirementsAlertKind.UnitAvailable, OutstandingRequirementsAlertKind.AutoDispatched];

/**
 * Reads the `outstandingRequirementsUpdated` payload: a camel-cased JSON string or, tolerated, an object. Null when there
 * is none (older servers send the call id alone) or it cannot be read; the caller then just refreshes.
 */
export const parseOutstandingRequirementsAlert = (payload: unknown): OutstandingRequirementsAlert | null => {
  let value: unknown = payload;
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const kind = toNumberOrNull(raw.kind);
  return {
    kind: kind !== null && KNOWN_KINDS.includes(kind) ? (kind as OutstandingRequirementsAlertKind) : OutstandingRequirementsAlertKind.Changed,
    unitId: toNumberOrNull(raw.unitId),
    unitName: toStringOrNull(raw.unitName),
    unitTypeName: toStringOrNull(raw.unitTypeName),
    message: toStringOrNull(raw.message),
    calls: Array.isArray(raw.calls) ? raw.calls.map(parseAlertCall).filter((call): call is OutstandingRequirementsAlertCall => call !== null) : [],
  };
};
