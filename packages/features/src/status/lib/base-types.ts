/**
 * Canonical meanings ("base types") of statuses and staffing levels (Unit's `lib/base-types`, kept byte-compatible).
 *
 * Departments name their statuses however they like ("IN QUARTERS", "Pager Only"), so the apps never decide what a
 * status means from its name or a hard-coded id: the API sends the meaning beside every value — `BaseType` on status
 * and staffing options, `StatusBaseType` / `StaffingBaseType` on personnel rows, `CurrentStatusBaseType` on unit rows.
 * -1 means the department gave the value no meaning; older servers send nothing (undefined).
 *
 * TODO(omni): move to @resgrid/models (or core) so data, maps and dashboards share one copy.
 */

export enum ActionBaseTypes {
  None = -1,
  Available = 0,
  NotResponding = 1,
  Responding = 2,
  OnScene = 3,
  MadeContact = 4,
  Investigating = 5,
  Dispatched = 6,
  Cleared = 7,
  Returning = 8,
  Staging = 9,
  Unavailable = 10,
  Enroute = 11,
  Transporting = 12,
  Delivering = 13,
  AtPatient = 14,
  AtHospital = 15,
  Searching = 16,
  Loading = 17,
  Standby = 18,
  OnPatrol = 19,
  Maintenance = 20,
  OnBreak = 21,
  Completed = 22,
  InQuarters = 23,
}

export enum StaffingBaseTypes {
  None = -1,
  Available = 0,
  Delayed = 1,
  Unavailable = 2,
  Committed = 3,
  OnShift = 4,
  OffDuty = 5,
  OnCall = 6,
}

export type AvailabilityClass = 'available' | 'delayed' | 'committed' | 'unavailable' | 'unknown';

export const AVAILABILITY_CLASSES: readonly Exclude<AvailabilityClass, 'unknown'>[] = ['available', 'delayed', 'committed', 'unavailable'];

const STATUS_AVAILABILITY: Record<number, AvailabilityClass> = {
  [ActionBaseTypes.Available]: 'available',
  [ActionBaseTypes.NotResponding]: 'unavailable',
  [ActionBaseTypes.Responding]: 'committed',
  [ActionBaseTypes.OnScene]: 'committed',
  [ActionBaseTypes.MadeContact]: 'committed',
  [ActionBaseTypes.Investigating]: 'committed',
  [ActionBaseTypes.Dispatched]: 'committed',
  [ActionBaseTypes.Cleared]: 'available',
  [ActionBaseTypes.Returning]: 'committed',
  [ActionBaseTypes.Staging]: 'committed',
  [ActionBaseTypes.Unavailable]: 'unavailable',
  [ActionBaseTypes.Enroute]: 'committed',
  [ActionBaseTypes.Transporting]: 'committed',
  [ActionBaseTypes.Delivering]: 'committed',
  [ActionBaseTypes.AtPatient]: 'committed',
  [ActionBaseTypes.AtHospital]: 'committed',
  [ActionBaseTypes.Searching]: 'committed',
  [ActionBaseTypes.Loading]: 'committed',
  [ActionBaseTypes.Standby]: 'committed',
  [ActionBaseTypes.OnPatrol]: 'available',
  [ActionBaseTypes.Maintenance]: 'unavailable',
  [ActionBaseTypes.OnBreak]: 'delayed',
  [ActionBaseTypes.Completed]: 'available',
  [ActionBaseTypes.InQuarters]: 'available',
};

const STAFFING_AVAILABILITY: Record<number, AvailabilityClass> = {
  [StaffingBaseTypes.Available]: 'available',
  [StaffingBaseTypes.Delayed]: 'delayed',
  [StaffingBaseTypes.Unavailable]: 'unavailable',
  [StaffingBaseTypes.Committed]: 'committed',
  [StaffingBaseTypes.OnShift]: 'available',
  [StaffingBaseTypes.OffDuty]: 'unavailable',
  [StaffingBaseTypes.OnCall]: 'available',
};

export const toBaseTypeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/** True when the base type was sent and means something (not None). */
export const hasBaseType = (baseType: unknown): boolean => {
  const n = toBaseTypeNumber(baseType);
  return n !== null && n >= 0;
};

/** The availability a status base type means; 'unknown' when it is missing or None. */
export const statusAvailability = (baseType: unknown): AvailabilityClass => {
  const n = toBaseTypeNumber(baseType);
  return n === null ? 'unknown' : (STATUS_AVAILABILITY[n] ?? 'unknown');
};

/** The availability a staffing base type means; 'unknown' when it is missing or None. */
export const staffingAvailability = (baseType: unknown): AvailabilityClass => {
  const n = toBaseTypeNumber(baseType);
  return n === null ? 'unknown' : (STAFFING_AVAILABILITY[n] ?? 'unknown');
};

/** Available or delayed: the resource can take another assignment (dispatch's rule). */
export const isStatusAvailable = (baseType: unknown): boolean => {
  const availability = statusAvailability(baseType);
  return availability === 'available' || availability === 'delayed';
};

/** Responding to an assignment (dispatched, responding, en route). */
export const isStatusResponding = (baseType: unknown): boolean => {
  const n = toBaseTypeNumber(baseType);
  return n === ActionBaseTypes.Dispatched || n === ActionBaseTypes.Responding || n === ActionBaseTypes.Enroute;
};

/** Working at the scene or with the patient/subject. */
export const isStatusOnScene = (baseType: unknown): boolean => {
  const n = toBaseTypeNumber(baseType);
  return n === ActionBaseTypes.OnScene || n === ActionBaseTypes.MadeContact || n === ActionBaseTypes.Investigating || n === ActionBaseTypes.AtPatient || n === ActionBaseTypes.Searching || n === ActionBaseTypes.Staging;
};

/** On duty for staffing purposes: available, on shift, on call, delayed or committed (not off duty or unavailable). */
export const isStaffingOnDuty = (baseType: unknown): boolean => {
  const availability = staffingAvailability(baseType);
  return availability === 'available' || availability === 'delayed' || availability === 'committed';
};
