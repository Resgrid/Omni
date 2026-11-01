/**
 * Which status set a unit uses (Unit `lib/unit-status-set`). `Statuses/GetAllUnitStatuses` lists the built-in statuses
 * under UnitType '0' and one entry per unit type with a custom set, keyed by the type's NAME and the set's id. A unit
 * carries its type's set id as `CustomStatusSetId`, which still finds the set after the type is renamed, so it is
 * matched first and the name second; a unit without a custom set uses the built-in entry.
 */

export interface UnitStatusSetLike<T> {
  UnitType: string;
  StatusId?: string | number | null;
  Statuses: T[];
}

export interface UnitStatusSetOwner {
  Type?: string | null;
  CustomStatusSetId?: string | number | null;
}

export const BUILT_IN_UNIT_TYPE = '0';

const toId = (value: number | string | null | undefined): string => (value == null ? '' : String(value).trim());

/** The unit's custom set, or null when it has none. */
export const findUnitStatusSet = <T, S extends UnitStatusSetLike<T>>(sets: readonly S[] | null | undefined, unit: UnitStatusSetOwner | null | undefined): S | null => {
  if (!sets || !unit) return null;
  const setId = toId(unit.CustomStatusSetId);
  if (setId !== '' && setId !== '0') {
    const bySetId = sets.find((set) => toId(set.StatusId) === setId);
    if (bySetId) return bySetId;
  }
  if (!unit.Type) return null;
  return sets.find((set) => set.UnitType === unit.Type && set.UnitType !== BUILT_IN_UNIT_TYPE) ?? null;
};

/** The options the unit picks from: its custom set, else the built-in statuses. */
export const getUnitStatusOptions = <T, S extends UnitStatusSetLike<T>>(sets: readonly S[] | null | undefined, unit: UnitStatusSetOwner | null | undefined): T[] =>
  (findUnitStatusSet<T, S>(sets, unit) ?? sets?.find((set) => set.UnitType === BUILT_IN_UNIT_TYPE) ?? null)?.Statuses ?? [];
