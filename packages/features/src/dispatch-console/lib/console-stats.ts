import { isScheduledCall } from '@resgrid/features/calls';
import { isStaffingOnDuty, isStatusAvailable } from '@resgrid/features/status';
import type { CallResultData, PersonnelInfoResultData, UnitInfoResultData } from '@resgrid/models';

export interface ConsoleStats {
  activeCalls: number;
  scheduledCalls: number;
  unitsAvailable: number;
  personnelAvailable: number;
  personnelOnDuty: number;
}

/** Available or delayed by the current status's MEANING (BaseType); a missing or meaningless status never counts. */
export const isUnitAvailable = (unit: Pick<UnitInfoResultData, 'CurrentStatusBaseType'>): boolean => isStatusAvailable(unit.CurrentStatusBaseType);

export const isPersonAvailable = (person: Pick<PersonnelInfoResultData, 'StatusBaseType'>): boolean => isStatusAvailable(person.StatusBaseType);

export const isPersonOnDuty = (person: Pick<PersonnelInfoResultData, 'StaffingBaseType'>): boolean => isStaffingOnDuty(person.StaffingBaseType);

/**
 * The console's stats bar (Dispatch baseline). Core has no scheduled state: a scheduled call is Active (0) with a future
 * dispatch time, so it counts as scheduled until then and as active after. Pending calls (8) are not in the active list;
 * their count comes from the pending queue. Availability is decided by BaseType only (never status text or ids).
 */
export function computeConsoleStats(calls: readonly CallResultData[], units: readonly UnitInfoResultData[], personnel: readonly PersonnelInfoResultData[], now: number): ConsoleStats {
  const open = calls.filter((call) => call.State === 0);
  const scheduledCalls = open.filter((call) => isScheduledCall(call, now)).length;
  return {
    activeCalls: open.length - scheduledCalls,
    scheduledCalls,
    unitsAvailable: units.filter(isUnitAvailable).length,
    personnelAvailable: personnel.filter(isPersonAvailable).length,
    personnelOnDuty: personnel.filter(isPersonOnDuty).length,
  };
}
