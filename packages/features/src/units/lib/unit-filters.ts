import { type AvailabilityFilter, statusAvailability } from '@resgrid/features/status';
import { type UnitInfoResultData } from '@resgrid/models';

export interface UnitListFilter {
  query: string;
  availability: AvailabilityFilter;
}

/** Client-side search (name, type, plate, VIN, group) and availability by the current status's MEANING (BaseType). */
export const filterUnits = (units: readonly UnitInfoResultData[], { query, availability }: UnitListFilter): UnitInfoResultData[] => {
  const needle = query.trim().toLowerCase();
  return units.filter((unit) => {
    if (availability !== 'all' && statusAvailability(unit.CurrentStatusBaseType) !== availability) return false;
    if (!needle) return true;
    return [unit.Name, unit.Type, unit.PlateNumber, unit.Vin, unit.GroupName, unit.CurrentStatus].some((value) => (value ?? '').toLowerCase().includes(needle));
  });
};

/** Server-side filter string (`GetAllUnitsInfos?activeFilter=`): the selected filter option ids joined with commas. */
export const toActiveFilter = (selected: readonly string[]): string => selected.join(',');
