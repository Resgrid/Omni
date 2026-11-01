import { parseUtcMs } from '@resgrid/core/utils/dates';
import { type UnitInfoResultData, UnitStatusAlertAcknowledgedLevel, UnitStatusAlertAcknowledgementMode, type UnitStatusAlertAcknowledgementResultData, type UnitStatusThresholdData } from '@resgrid/models';

/**
 * Time-in-status alerting (BigBoard `lib/unit-status-thresholds`). A department can say "flag a unit dispatched for more
 * than four minutes without reporting departed". Thresholds are keyed by the status's BaseType (what it means), never
 * by the department's status ids or names. With no thresholds configured nothing is ever flagged.
 */

/** The unit row the board reads (`CurrentUnitStateId` is the status record an acknowledgement covers). */
export type BoardUnit = UnitInfoResultData;

export type UnitStatusAlertLevel = 'none' | 'warn' | 'alert';

export interface UnitStatusAlert {
  level: UnitStatusAlertLevel;
  /** Seconds the unit has been in its current status; null when the timestamp was unusable. */
  secondsInStatus: number | null;
  /** The threshold that fired; null when nothing fired. */
  thresholdSeconds: number | null;
}

export const NO_ALERT: UnitStatusAlert = { level: 'none', secondsInStatus: null, thresholdSeconds: null };

/** Seconds since a UTC timestamp (shared parser: some `*Utc` fields arrive without "Z"); null when unusable. */
export const secondsSince = (timestampUtc: string | null | undefined, now: number): number | null => {
  const at = parseUtcMs(timestampUtc);
  return at === null ? null : Math.max(0, Math.floor((now - at) / 1000));
};

/** Evaluates one unit against the thresholds at one instant (`now` is shared by the whole list so no two units disagree). */
export function evaluateUnitStatusAlert(unit: Pick<BoardUnit, 'CurrentStatusBaseType' | 'CurrentStatusTimestampUtc'>, thresholds: readonly UnitStatusThresholdData[], now: number): UnitStatusAlert {
  if (thresholds.length === 0) return NO_ALERT;
  const baseType = unit.CurrentStatusBaseType;
  if (typeof baseType !== 'number') return NO_ALERT;
  const threshold = thresholds.find((entry) => entry.BaseType === baseType);
  if (!threshold) return NO_ALERT;
  const elapsed = secondsSince(unit.CurrentStatusTimestampUtc, now);
  // An unknown time in status is not an alert: inventing one on a screen dispatchers act on is the worse mistake.
  if (elapsed === null) return NO_ALERT;
  if (threshold.AlertSeconds > 0 && elapsed >= threshold.AlertSeconds) return { level: 'alert', secondsInStatus: elapsed, thresholdSeconds: threshold.AlertSeconds };
  if (threshold.WarnSeconds > 0 && elapsed >= threshold.WarnSeconds) return { level: 'warn', secondsInStatus: elapsed, thresholdSeconds: threshold.WarnSeconds };
  return { level: 'none', secondsInStatus: elapsed, thresholdSeconds: null };
}

/** none = nobody acknowledged it · acknowledged = seen, stays highlighted · muted = out of the way until it ends. */
export type UnitAlertAcknowledgementState = 'none' | 'acknowledged' | 'muted';

const LEVEL_RANK: Record<UnitStatusAlertLevel, number> = { none: 0, warn: 1, alert: 2 };

/** Mirrors the server's UnitStatusAlertNoteRequirements. */
export const UnitStatusAlertNoteRequirement = { Optional: 0, AtAlert: 1, Always: 2 } as const;

/** Whether acknowledging or muting at `level` needs a note (same rule as the server, which enforces it regardless). */
export const requiresAcknowledgementNote = (requirement: number | null | undefined, level: UnitStatusAlertLevel): boolean => {
  if (requirement === UnitStatusAlertNoteRequirement.Always) return level === 'warn' || level === 'alert';
  if (requirement === UnitStatusAlertNoteRequirement.AtAlert) return level === 'alert';
  return false;
};

export const toAcknowledgedLevel = (level: UnitStatusAlertLevel): UnitStatusAlertAcknowledgedLevel => (level === 'alert' ? UnitStatusAlertAcknowledgedLevel.Alert : UnitStatusAlertAcknowledgedLevel.Warn);

/**
 * Whether an acknowledgement still covers a unit (same rules as the server's `UnitStatusAlertEvaluator.Resolve`): not
 * after the unit reports a new status, not past the level that was acknowledged, and a mute that ran out (or whose end
 * cannot be read) falls back to acknowledged.
 */
export function resolveAcknowledgement(
  acknowledgement: UnitStatusAlertAcknowledgementResultData | null | undefined,
  unit: Pick<BoardUnit, 'CurrentUnitStateId'> | null | undefined,
  level: UnitStatusAlertLevel,
  now: number
): UnitAlertAcknowledgementState {
  if (!acknowledgement || acknowledgement.ClearedOnUtc || level === 'none') return 'none';
  const stateId = unit?.CurrentUnitStateId;
  if (typeof stateId !== 'number' || stateId <= 0 || acknowledgement.UnitStateId !== stateId) return 'none';
  if (LEVEL_RANK[level] > acknowledgement.Level) return 'none';
  if (acknowledgement.Mode === UnitStatusAlertAcknowledgementMode.Muted) {
    if (!acknowledgement.MutedUntilUtc) return 'muted';
    const mutedUntil = parseUtcMs(acknowledgement.MutedUntilUtc);
    if (mutedUntil !== null && mutedUntil > now) return 'muted';
  }
  return 'acknowledged';
}

/** Sort weight: alerts, warnings, acknowledged alerts, acknowledged warnings, then everything else (muted included). */
export const acknowledgedSortWeight = (level: UnitStatusAlertLevel, state: UnitAlertAcknowledgementState): number => {
  if (level === 'none' || state === 'muted') return 4;
  if (state === 'acknowledged') return level === 'alert' ? 2 : 3;
  return level === 'alert' ? 0 : 1;
};

export interface AnnotatedUnit {
  unit: BoardUnit;
  alert: UnitStatusAlert;
  /** The acknowledgement on file, whether or not it still covers the alert. */
  acknowledgement: UnitStatusAlertAcknowledgementResultData | null;
  acknowledgementState: UnitAlertAcknowledgementState;
}

export function annotateUnit(unit: BoardUnit, thresholds: readonly UnitStatusThresholdData[], acknowledgements: Readonly<Record<string, UnitStatusAlertAcknowledgementResultData>>, now: number): AnnotatedUnit {
  const alert = evaluateUnitStatusAlert(unit, thresholds, now);
  const acknowledgement = acknowledgements[unit.UnitId] ?? null;
  return { unit, alert, acknowledgement, acknowledgementState: resolveAcknowledgement(acknowledgement, unit, alert.level, now) };
}

/** Most urgent first; within a level, longest in status first. */
export const compareAnnotatedUnits = (a: AnnotatedUnit, b: AnnotatedUnit): number =>
  acknowledgedSortWeight(a.alert.level, a.acknowledgementState) - acknowledgedSortWeight(b.alert.level, b.acknowledgementState) || (b.alert.secondsInStatus ?? 0) - (a.alert.secondsInStatus ?? 0);

/** Units no timer can apply to (status without a meaning). Zero when no timers are configured. */
export const countUnitsWithoutMeaning = (units: readonly BoardUnit[], thresholds: readonly UnitStatusThresholdData[]): number =>
  thresholds.length === 0 ? 0 : units.filter((unit) => typeof unit.CurrentStatusBaseType !== 'number' || unit.CurrentStatusBaseType < 0).length;

/** Whether this board user may acknowledge a unit's alert: the Create Call right, a known status record, not editing. */
export const canAcknowledgeUnit = (unit: Pick<BoardUnit, 'CurrentUnitStateId'>, canCreateCalls: boolean, isEditMode: boolean): boolean => !isEditMode && canCreateCalls && (unit.CurrentUnitStateId ?? 0) > 0;

export interface AlertColors {
  background: string | undefined;
  edge: string | undefined;
}

/** Row colours per level and theme; undefined leaves the row alone. */
export const alertColors = (level: UnitStatusAlertLevel, isDark: boolean): AlertColors => {
  if (level === 'alert') return { background: isDark ? '#4c1d1d' : '#fee2e2', edge: '#dc2626' };
  if (level === 'warn') return { background: isDark ? '#463016' : '#fef3c7', edge: '#d97706' };
  return { background: undefined, edge: undefined };
};

/** An acknowledged alert keeps its edge colour and loses the loud fill. */
export const acknowledgedColors = (level: UnitStatusAlertLevel, isDark: boolean): AlertColors => {
  const { edge } = alertColors(level, isDark);
  return edge ? { background: isDark ? '#1f2937' : '#f3f4f6', edge } : { background: undefined, edge: undefined };
};
