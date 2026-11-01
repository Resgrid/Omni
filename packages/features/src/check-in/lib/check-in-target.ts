import type { CheckInTimerStatusResultData } from '@resgrid/models';

import { CheckInType } from './check-in-status';

/** Who may record a check-in from this device (variant capability `checkIn`). */
export interface CheckInAbility {
  /** `checkIn.self`: the signed-in member (and the unit they ride on) checks in. */
  self: boolean;
  /** `checkIn.others`: an incident commander or dispatcher checks in on anyone's behalf. */
  others: boolean;
}

export interface CheckInIdentity {
  userId: string | null;
  /** Units the member currently rides on (unit-role seats) or the Unit app's active unit. */
  unitIds: readonly string[];
}

const normalize = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  const numeric = Number(text);
  return text !== '' && Number.isInteger(numeric) ? String(numeric) : text.toLowerCase();
};

/** Generic API placeholders ("UnitType", "Personnel") that must not be shown as an entity name (Responder check-in target). */
const isPlaceholderName = (timer: Pick<CheckInTimerStatusResultData, 'TargetType' | 'TargetTypeName'>, name: string): boolean => {
  const value = normalize(name);
  if (!value || value === normalize(timer.TargetTypeName)) return true;
  if (timer.TargetType === CheckInType.Unit) return value === 'unit' || value === 'unittype';
  if (timer.TargetType === CheckInType.Personnel) return ['personnel', 'user', 'person', 'personneltype'].includes(value);
  return false;
};

/** The card title: the named person/unit when known, else the type name; '' asks the UI for a translated placeholder. */
export function checkInTimerTitle(timer: Pick<CheckInTimerStatusResultData, 'TargetType' | 'TargetTypeName' | 'TargetName'>): string {
  const name = timer.TargetName?.trim() ?? '';
  if (timer.TargetType === CheckInType.Personnel || timer.TargetType === CheckInType.Unit) return isPlaceholderName(timer, name) ? '' : name;
  return timer.TargetTypeName?.trim() || name;
}

/** Whether this device may check in against a timer: anyone's with `others`; with `self`, only the member's own or their unit's. */
export function canCheckInTimer(timer: Pick<CheckInTimerStatusResultData, 'TargetType' | 'TargetEntityId' | 'UnitId'>, ability: CheckInAbility, identity: CheckInIdentity): boolean {
  if (ability.others) return true;
  if (!ability.self) return false;
  if (timer.TargetType === CheckInType.Personnel) return !timer.TargetEntityId || normalize(timer.TargetEntityId) === normalize(identity.userId);
  if (timer.TargetType === CheckInType.Unit) {
    const units = identity.unitIds.map(normalize);
    const target = normalize(timer.UnitId) || normalize(timer.TargetEntityId);
    return units.length > 0 && (target === '' || units.includes(target));
  }
  // IC, PAR, hazmat, sector rotation, rehab: a member records their own.
  return true;
}
