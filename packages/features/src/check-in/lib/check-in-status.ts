import type { CheckInTimerStatusResultData } from '@resgrid/models';

/** Check-in target types (resgrid-domain): Personnel 0, UnitType 1, IC 2, PAR 3, HazmatExposure 4, SectorRotation 5, Rehab 6. */
export const CheckInType = {
  Personnel: 0,
  Unit: 1,
  IncidentCommand: 2,
  Par: 3,
  Hazmat: 4,
  SectorRotation: 5,
  Rehab: 6,
} as const;

export const CHECK_IN_TYPE_LABEL_KEYS: Record<number, string> = {
  [CheckInType.Personnel]: 'check_in.type_personnel',
  [CheckInType.Unit]: 'check_in.type_unit',
  [CheckInType.IncidentCommand]: 'check_in.type_ic',
  [CheckInType.Par]: 'check_in.type_par',
  [CheckInType.Hazmat]: 'check_in.type_hazmat',
  [CheckInType.SectorRotation]: 'check_in.type_sector_rotation',
  [CheckInType.Rehab]: 'check_in.type_rehab',
};

/** Types a member can record for themselves (Responder sheet: unit check-ins come from a unit's timer card only). */
export const SELF_CHECK_IN_TYPES: readonly number[] = [CheckInType.Personnel, CheckInType.Par, CheckInType.Hazmat, CheckInType.SectorRotation, CheckInType.Rehab];
/** Types an incident commander or dispatcher can record for anyone (IC/Dispatch). */
export const OTHERS_CHECK_IN_TYPES: readonly number[] = [CheckInType.Personnel, CheckInType.Unit, CheckInType.IncidentCommand, CheckInType.Par, CheckInType.Hazmat, CheckInType.SectorRotation, CheckInType.Rehab];

export type CheckInSeverity = 'critical' | 'warning' | 'ok' | 'unknown';

/** Severity by the status literal (CheckInTimerStatus: Ok/Green, Warning/Yellow, Overdue/Red/Critical). */
export function checkInSeverity(status: string | null | undefined): CheckInSeverity {
  switch (status) {
    case 'Critical':
    case 'Overdue':
    case 'Red':
      return 'critical';
    case 'Warning':
    case 'Yellow':
      return 'warning';
    case 'Ok':
    case 'Green':
      return 'ok';
    default:
      return 'unknown';
  }
}

export const CHECK_IN_SEVERITY_COLORS: Record<CheckInSeverity, string> = { critical: '#DC2626', warning: '#D97706', ok: '#16A34A', unknown: '#6B7280' };

export const CHECK_IN_STATUS_LABEL_KEYS: Record<string, string> = {
  Ok: 'check_in.status_ok',
  Green: 'check_in.status_green',
  Warning: 'check_in.status_warning',
  Yellow: 'check_in.status_warning',
  Overdue: 'check_in.status_overdue',
  Red: 'check_in.status_overdue',
  Critical: 'check_in.status_critical',
};

/** Progress through the timer window, 0–1. */
export const timerProgress = (timer: Pick<CheckInTimerStatusResultData, 'ElapsedMinutes' | 'DurationMinutes'>, elapsedMinutes = timer.ElapsedMinutes): number =>
  timer.DurationMinutes > 0 ? Math.min(Math.max(elapsedMinutes / timer.DurationMinutes, 0), 1) : 0;

/** PAR state of one person on the call (Dispatch/IC accountability): needs a check-in, overdue, or ok. */
export type ParState = 'overdue' | 'needs' | 'ok';

export function parState(row: { NeedsCheckIn: boolean; Status: string; MinutesRemaining: number }): ParState {
  if (checkInSeverity(row.Status) === 'critical' || (row.NeedsCheckIn && row.MinutesRemaining <= 0)) return 'overdue';
  if (row.NeedsCheckIn) return 'needs';
  return 'ok';
}

export const PAR_STATE_LABEL_KEYS: Record<ParState, string> = { overdue: 'check_in.par.overdue', needs: 'check_in.par.needs', ok: 'check_in.par.ok' };
export const PAR_STATE_COLORS: Record<ParState, string> = { overdue: CHECK_IN_SEVERITY_COLORS.critical, needs: CHECK_IN_SEVERITY_COLORS.warning, ok: CHECK_IN_SEVERITY_COLORS.ok };
