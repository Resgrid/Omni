import { type AvailabilityFilter, staffingAvailability, statusAvailability } from '@resgrid/features/status';
import { type PersonnelInfoResultData } from '@resgrid/models';

export interface PersonnelListFilter {
  query: string;
  /** By the current status's MEANING (StatusBaseType), never by its text. */
  availability: AvailabilityFilter;
  /** Hide members whose staffing means off duty / unavailable. */
  onDutyOnly?: boolean;
}

export const personName = (person: Pick<PersonnelInfoResultData, 'FirstName' | 'LastName'>): string => `${person.FirstName ?? ''} ${person.LastName ?? ''}`.trim();

/**
 * Personnel search and filters. The search never matches PII (email, phone, id number) for a viewer without
 * `CanViewPII`, so a hidden value cannot be probed through the search box.
 */
export const filterPersonnel = (personnel: readonly PersonnelInfoResultData[], { query, availability, onDutyOnly = false }: PersonnelListFilter, canViewPII: boolean): PersonnelInfoResultData[] => {
  const needle = query.trim().toLowerCase();
  return personnel.filter((person) => {
    if (availability !== 'all' && statusAvailability(person.StatusBaseType) !== availability) return false;
    if (onDutyOnly && staffingAvailability(person.StaffingBaseType) === 'unavailable') return false;
    if (!needle) return true;
    const fields = [personName(person), person.GroupName, person.Status, person.Staffing, ...(person.Roles ?? [])];
    if (canViewPII) fields.push(person.EmailAddress, person.MobilePhone, person.IdentificationNumber);
    return fields.some((value) => (value ?? '').toLowerCase().includes(needle));
  });
};

/** Sorted by last name, then first name (Responder). */
export const sortPersonnel = (personnel: readonly PersonnelInfoResultData[]): PersonnelInfoResultData[] =>
  [...personnel].sort((a, b) => (a.LastName ?? '').localeCompare(b.LastName ?? '') || (a.FirstName ?? '').localeCompare(b.FirstName ?? ''));
