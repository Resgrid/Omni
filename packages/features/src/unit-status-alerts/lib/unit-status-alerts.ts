import { parseUtcMs } from '@resgrid/core/utils/dates';
import { type UnitInfoResultData, UnitStatusAlertAcknowledgedLevel, UnitStatusAlertAcknowledgementMode, type UnitStatusAlertAcknowledgementResultData, type UnitStatusThresholdData } from '@resgrid/models';

/**
 * Time-in-status alerting (BigBoard `lib/unit-status-thresholds`). A department can say "flag a unit dispatched for more
 * than four minutes without reporting departed". Thresholds are keyed by the status's BaseType (what it means), never
 * by the department's status ids or names. With no thresholds configured nothing is ever flagged.
 */

/** The unit row the timers read (`CurrentUnitStateId` is the status record an acknowledgement covers). */
export type BoardUnit = UnitInfoResultData;

export type UnitStatusAlertLevel = 'none' | 'warn' | 'alert';

export interface UnitStatusAlert {
  level: UnitStatusAlertLevel;
  /** Seconds the unit has been in its current status; null when the timestamp was unusable. */
  secondsInStatus: number | null;
  /** The threshold that fired; null when nothing fired. */
  thresholdSeconds: number | null;
}

/** Returned to every caller whose unit has nothing to flag, so it is frozen: one caller cannot change it for the rest. */
export const NO_ALERT: Readonly<UnitStatusAlert> = Object.freeze({ level: 'none', secondsInStatus: null, thresholdSeconds: null });

/** Seconds since a UTC timestamp (shared parser: some `*Utc` fields arrive without "Z"); null when unusable. */
export const secondsSince = (timestampUtc: string | null | undefined, now: number): number | null => {
  const at = parseUtcMs(timestampUtc);

  return at === null ? null : Math.max(0, Math.floor((now - at) / 1000));
};

/** Compact duration for status timers: "45s", "4m", "1h 12m". Empty when unknown. */
export const formatElapsed = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';

  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m`;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/** The department's timer for the unit's current status (by meaning); null when none applies. */
const thresholdFor = (unit: Pick<BoardUnit, 'CurrentStatusBaseType'>, thresholds: readonly UnitStatusThresholdData[]): UnitStatusThresholdData | null => {
  const baseType = unit.CurrentStatusBaseType ?? null;

  if (baseType === null || thresholds.length === 0) return null;

  return thresholds.find((entry) => entry.BaseType === baseType) ?? null;
};

/** Evaluates one unit against the thresholds at one instant (`now` is shared by the whole list so no two units disagree). */
export function evaluateUnitStatusAlert(unit: Pick<BoardUnit, 'CurrentStatusBaseType' | 'CurrentStatusTimestampUtc'>, thresholds: readonly UnitStatusThresholdData[], now: number): UnitStatusAlert {
  const threshold = thresholdFor(unit, thresholds);

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

const LEVEL_RANK: Readonly<Record<UnitStatusAlertLevel, number>> = { none: 0, warn: 1, alert: 2 };

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
  const stateId = unit?.CurrentUnitStateId ?? 0;

  if (stateId <= 0 || acknowledgement.UnitStateId !== stateId) return 'none';

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

export interface UnitAlertsSummary {
  /** Units over a timer that nobody has acknowledged or muted yet: the ones to contact. */
  unacknowledged: number;
  /** The highest level among those (none when there are none). */
  worstUnacknowledged: UnitStatusAlertLevel;
  /** Units over a timer that are not muted (acknowledged ones included). */
  active: number;
}

/** What a console's tile and tab badge count. */
export function summarizeUnitAlerts(annotated: readonly AnnotatedUnit[]): UnitAlertsSummary {
  let unacknowledged = 0;
  let active = 0;
  let worst: UnitStatusAlertLevel = 'none';

  for (const { alert, acknowledgementState } of annotated) {
    if (alert.level === 'none' || acknowledgementState === 'muted') continue;
    active += 1;

    if (acknowledgementState !== 'none') continue;
    unacknowledged += 1;

    if (LEVEL_RANK[alert.level] > LEVEL_RANK[worst]) worst = alert.level;
  }

  return { unacknowledged, worstUnacknowledged: worst, active };
}

/** Units no timer can apply to (status without a meaning). Zero when no timers are configured. */
export const countUnitsWithoutMeaning = (units: readonly BoardUnit[], thresholds: readonly UnitStatusThresholdData[]): number =>
  thresholds.length === 0 ? 0 : units.filter((unit) => (unit.CurrentStatusBaseType ?? -1) < 0).length;

/** Whether this user may acknowledge a unit's alert: the Create Call right, a known status record, not editing. */
export const canAcknowledgeUnit = (unit: Pick<BoardUnit, 'CurrentUnitStateId'>, canCreateCalls: boolean, isEditMode: boolean): boolean => !isEditMode && canCreateCalls && (unit.CurrentUnitStateId ?? 0) > 0;

// ---- the unit's own timer (Unit app) ------------------------------------------------------------------------------

/** The longest heads-up a unit gets before its first timer fires. */
export const UNIT_TIMER_APPROACH_MAX_SECONDS = 60;

/** How long before a threshold the unit is told it is coming: a quarter of the threshold, at most a minute. */
export const approachLeadSeconds = (thresholdSeconds: number): number => Math.min(UNIT_TIMER_APPROACH_MAX_SECONDS, Math.floor(thresholdSeconds / 4));

export interface UnitStatusTimerStep {
  level: Exclude<UnitStatusAlertLevel, 'none'>;
  /** Seconds in status at which it fires. */
  atSeconds: number;
  /** Seconds left until it fires. */
  inSeconds: number;
}

export interface UnitStatusTimer {
  /** The department has a timer for the unit's current status (and its time in status is known). */
  hasTimer: boolean;
  alert: UnitStatusAlert;
  /** The next threshold the status will cross (warn, then alert); null once at alert or without a timer. */
  next: UnitStatusTimerStep | null;
  /** Not yet warned, and the first threshold is close: the unit hears it is coming before dispatch sees it. */
  approaching: boolean;
}

/** Shared like NO_ALERT, so frozen too. */
export const NO_TIMER: Readonly<UnitStatusTimer> = Object.freeze({ hasTimer: false, alert: NO_ALERT, next: null, approaching: false });

/** The unit's own timer at one instant: its level, what fires next and when, and whether that is close. */
export function evaluateUnitStatusTimer(unit: Pick<BoardUnit, 'CurrentStatusBaseType' | 'CurrentStatusTimestampUtc'>, thresholds: readonly UnitStatusThresholdData[], now: number): UnitStatusTimer {
  const threshold = thresholdFor(unit, thresholds);

  if (!threshold || (threshold.WarnSeconds <= 0 && threshold.AlertSeconds <= 0)) return NO_TIMER;
  const alert = evaluateUnitStatusAlert(unit, thresholds, now);
  const elapsed = alert.secondsInStatus;

  if (elapsed === null) return NO_TIMER;
  const candidates: UnitStatusTimerStep[] = [];

  if (alert.level === 'none' && threshold.WarnSeconds > 0) candidates.push({ level: 'warn', atSeconds: threshold.WarnSeconds, inSeconds: threshold.WarnSeconds - elapsed });

  if (alert.level !== 'alert' && threshold.AlertSeconds > 0) candidates.push({ level: 'alert', atSeconds: threshold.AlertSeconds, inSeconds: threshold.AlertSeconds - elapsed });
  const next = candidates.filter((step) => step.inSeconds > 0).sort((a, b) => a.atSeconds - b.atSeconds)[0] ?? null;
  const approaching = alert.level === 'none' && next !== null && next.inSeconds <= approachLeadSeconds(next.atSeconds);

  return { hasTimer: true, alert, next, approaching };
}

/** The roster row predates the unit's current status (`GetUnitStatus` is newer): its timer belongs to the last one. */
export const isRosterBehind = (unit: Pick<BoardUnit, 'CurrentStatusTimestampUtc'>, currentStatusUtc: string | null | undefined): boolean => {
  const current = parseUtcMs(currentStatusUtc);
  const roster = parseUtcMs(unit.CurrentStatusTimestampUtc);

  return current !== null && roster !== null && current - roster > 1000;
};

export interface UnitStatusTimerFiring {
  level: Exclude<UnitStatusAlertLevel, 'none'>;
  /** Seconds in status at which it fires. */
  atSeconds: number;
  /** When it fires (epoch ms). */
  at: number;
}

export interface UnitStatusTimerSchedule {
  /** The status episode the timer runs for (unit, status record, start): a notice from any other one is stale. */
  episode: string;
  /** When each threshold fires (warn, then alert), dispatch's mutes left out. Past ones are included. */
  firings: UnitStatusTimerFiring[];
}

export interface UnitStatusTimerScheduleInput {
  unit: Pick<BoardUnit, 'UnitId' | 'CurrentStatusBaseType' | 'CurrentStatusTimestampUtc' | 'CurrentUnitStateId'>;
  thresholds: readonly UnitStatusThresholdData[];
  acknowledgement: UnitStatusAlertAcknowledgementResultData | null;
  /** A newer status waits in the outbox. */
  hasPendingStatus: boolean;
  /** When the unit's current status began (`GetUnitStatus`), when known. */
  currentStatusUtc: string | null;
}

/**
 * When the unit's own timer fires, worked out ahead for notifications the device shows while the app is in the
 * background (same thresholds and roster row as the on-screen timer and dispatch's board). Null when the status it would
 * time has already ended: a newer status waits in the outbox, or the roster row predates the unit's current status. A
 * firing that dispatch's mute will still cover at that moment is left out (the mute lasts until it runs out, or until the
 * status changes, and covers only the level that was muted).
 */
export function scheduleUnitStatusTimer(input: UnitStatusTimerScheduleInput): UnitStatusTimerSchedule | null {
  const { unit } = input;

  if (input.hasPendingStatus || isRosterBehind(unit, input.currentStatusUtc)) return null;
  const startedAt = parseUtcMs(unit.CurrentStatusTimestampUtc);
  const episode = [unit.UnitId, unit.CurrentUnitStateId ?? 0, startedAt ?? 'unknown'].join(':');
  const threshold = thresholdFor(unit, input.thresholds);

  if (startedAt === null || !threshold) return { episode, firings: [] };
  const steps: Omit<UnitStatusTimerFiring, 'at'>[] = [];

  // Warn only before alert, as on the board (a warn at or past the alert never shows).
  if (threshold.WarnSeconds > 0 && (threshold.AlertSeconds <= 0 || threshold.WarnSeconds < threshold.AlertSeconds)) steps.push({ level: 'warn', atSeconds: threshold.WarnSeconds });

  if (threshold.AlertSeconds > 0) steps.push({ level: 'alert', atSeconds: threshold.AlertSeconds });
  const firings = steps.map((step) => ({ ...step, at: startedAt + step.atSeconds * 1000 }));

  return { episode, firings: firings.filter((firing) => resolveAcknowledgement(input.acknowledgement, unit, firing.level, firing.at) !== 'muted') };
}

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

/** The colours a unit's alert row or chip uses for its level and acknowledgement. */
export const annotatedColors = (level: UnitStatusAlertLevel, state: UnitAlertAcknowledgementState, isDark: boolean): AlertColors => (state === 'none' ? alertColors(level, isDark) : acknowledgedColors(level, isDark));
