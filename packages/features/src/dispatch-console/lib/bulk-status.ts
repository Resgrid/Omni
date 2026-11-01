import { getUnitStatusOptions, hasBaseType } from '@resgrid/features/status';
import type { StatusesResultData, UnitInfoResultData, UnitTypeStatusResultData } from '@resgrid/models';

/** A status every unit of a multi-unit selection can be set to, with each unit's own option for it. */
export interface CommonUnitStatusOption {
  key: string;
  /** The first unit's option (display: text, colours, Detail/Note). */
  status: StatusesResultData;
  /** Each unit's own option: the id its status set uses. */
  statusByUnitId: Record<string, StatusesResultData>;
}

/**
 * How one status is recognised across different status sets: by its meaning (BaseType) when the department gave it one,
 * else by its name. Units of different types can use different custom sets where the "same" status ("At Hospital" for an
 * ambulance and for an MUG) has a different id per set.
 */
export const commonStatusKey = (status: Pick<StatusesResultData, 'BaseType' | 'Text'>): string => (hasBaseType(status.BaseType) ? `base:${Number(status.BaseType)}` : `text:${(status.Text ?? '').trim().toLowerCase()}`);

/**
 * The statuses a group of units can all be set to in one action, ordered as the first unit's set. Each unit keeps its
 * own status id; a unit whose set lacks an option removes it from the group's choices.
 */
export function resolveCommonUnitStatusOptions(units: readonly Pick<UnitInfoResultData, 'UnitId' | 'CustomStatusSetId' | 'Type'>[], sets: readonly UnitTypeStatusResultData[]): CommonUnitStatusOption[] {
  if (units.length === 0) return [];
  const byUnit = units.map((unit) => {
    const options = new Map<string, StatusesResultData>();
    for (const status of getUnitStatusOptions<StatusesResultData, UnitTypeStatusResultData>(sets, unit)) {
      const key = commonStatusKey(status);
      if (!options.has(key)) options.set(key, status);
    }
    return { unitId: unit.UnitId, options };
  });
  const [first, ...rest] = byUnit;
  const result: CommonUnitStatusOption[] = [];
  first.options.forEach((status, key) => {
    if (!rest.every((entry) => entry.options.has(key))) return;
    const statusByUnitId: Record<string, StatusesResultData> = {};
    for (const entry of byUnit) statusByUnitId[entry.unitId] = entry.options.get(key) as StatusesResultData;
    result.push({ key, status, statusByUnitId });
  });
  return result;
}
