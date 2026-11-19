import { personnelFullName } from '@resgrid/data';
import type { DispatchRecipients } from '@resgrid/features/calls';
import type { GroupResultData, PersonnelInfoResultData, RoleResultData, UnitResultData } from '@resgrid/models';

import type { RecurringAlertRecipients, RecurringDispatchTargets } from './schedule-form';

/** Names by id for one list of recipients. */
const namesById = <T>(list: readonly T[], idOf: (item: T) => string | number, nameOf: (item: T) => string | null | undefined): Map<string, string> => new Map(list.map((item) => [String(idOf(item)), nameOf(item) ?? '']));

const personId = (person: PersonnelInfoResultData): string => person.UserId;
const groupId = (group: GroupResultData): string | number => group.GroupId;
const roleId = (role: RoleResultData): string | number => role.RoleId;
const unitId = (unit: UnitResultData): string | number => unit.UnitId;
const groupName = (group: GroupResultData): string => group.Name;
const roleName = (role: RoleResultData): string => role.Name;
const unitName = (unit: UnitResultData): string => unit.Name;

/** Each id's name, or the id itself when the list no longer has it (a member who left, a deleted unit). */
const named = (ids: readonly string[] | undefined, names: Map<string, string>): string[] => (ids ?? []).map((id) => names.get(id) || id);

/** The names of who a schedule dispatches or alerts, people first, then groups, roles and units. */
export function targetNames(targets: Partial<RecurringDispatchTargets> | RecurringAlertRecipients, recipients: DispatchRecipients): string[] {
  const units = 'units' in targets ? targets.units : [];

  return [
    ...named(targets.users, namesById(recipients.personnel, personId, personnelFullName)),
    ...named(targets.groups, namesById(recipients.groups, groupId, groupName)),
    ...named(targets.roles, namesById(recipients.roles, roleId, roleName)),
    ...named(units, namesById(recipients.units, unitId, unitName)),
  ];
}

/** One line for a summary ("Medic 1, Station 2, Paramedics +3"); `none` when nobody is chosen. */
export function summarizeNames(names: readonly string[], none: string): string {
  if (names.length === 0) return none;

  return names.length > 4 ? `${names.slice(0, 4).join(', ')} +${names.length - 4}` : names.join(', ');
}
