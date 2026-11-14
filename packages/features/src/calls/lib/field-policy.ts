import { type NewCallFieldKey, NewCallFieldKeys, type NewCallFieldRuleData } from '@resgrid/models';

/**
 * The department's new-call field policy (`Calls/GetNewCallFieldPolicy`, Dispatch `useNewCallFieldPolicy`): hide the
 * fields the department does not use and refuse to submit until the fields it requires have values. Fail-open: no
 * rules (unreachable, offline, older server) keeps the stock form — the server enforces the same policy on save.
 */
/** What the form holds for a policy field: text, a picked id, a "has one" flag or a list of picked ids. */
export type PolicyFieldValue = string | number | boolean | readonly number[] | null | undefined;

/** The form's values keyed by policy field, for `missingRequired`. */
export type PolicyFieldValues = Partial<Record<NewCallFieldKey, PolicyFieldValue>>;

export interface NewCallFieldPolicy {
  isVisible: (key: NewCallFieldKey) => boolean;
  isRequired: (key: NewCallFieldKey) => boolean;
  /** Required fields left blank, given the current form values. Empty = the form may submit. */
  missingRequired: (values: PolicyFieldValues) => NewCallFieldKey[];
  isLoaded: boolean;
}

const CANONICAL_KEYS = new Map<string, NewCallFieldKey>(Object.values(NewCallFieldKeys).map((key) => [key.toLowerCase(), key]));

/** The four recipient lists of the Dispatch To selection, each of which a department can hide (Core `DispatchTargets`). */
export const DISPATCH_LIST_KEYS = [NewCallFieldKeys.DispatchPersonnel, NewCallFieldKeys.DispatchGroups, NewCallFieldKeys.DispatchRoles, NewCallFieldKeys.DispatchUnits] as const;

export type DispatchListKey = (typeof DISPATCH_LIST_KEYS)[number];

const isDispatchListKey = (key: NewCallFieldKey): boolean => DISPATCH_LIST_KEYS.some((listKey) => listKey === key);

/**
 * Fields that can be hidden but never required (Core `HideOnly`): a plus code only locates the call while it is entered
 * and is never stored; the check-in timers, Part 2 consent and save-as-pending switches have "off" as an answer; and one
 * recipient list is covered by requiring the recipients as a whole (`dispatchList`), which any list satisfies.
 */
const NEVER_REQUIRED_KEYS = new Set<NewCallFieldKey>([
  NewCallFieldKeys.PlusCode,
  NewCallFieldKeys.AdditionalContacts,
  NewCallFieldKeys.CheckInTimers,
  NewCallFieldKeys.Part2Consent,
  NewCallFieldKeys.PendingCall,
  ...DISPATCH_LIST_KEYS,
]);

/** Whether a field can be required at all: a hide-only field never carries a required marker, whatever the rule says. */
export const canBeRequired = (key: NewCallFieldKey): boolean => !NEVER_REQUIRED_KEYS.has(key);

export const hasFieldValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;

  if (typeof value === 'string') return value.trim().length > 0;

  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;

  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) return value.length > 0;

  return true;
};

export function createFieldPolicy(rules: readonly NewCallFieldRuleData[] | null | undefined, isLoaded = true): NewCallFieldPolicy {
  const byKey = new Map<string, NewCallFieldRuleData>();

  for (const rule of rules ?? []) if (rule?.Key) byKey.set(rule.Key.toLowerCase(), rule);

  const ruleFor = (key: NewCallFieldKey): NewCallFieldRuleData | undefined => byKey.get(key.toLowerCase());

  // Core `NewCallFieldPolicy.IsVisible`. Core reports the effective rule of every key, so each key reads as sent; the
  // fallbacks only matter for a server that predates the per-list keys: a list with no rule of its own follows the
  // section's rule (hiding the section used to hide every list), and the section shows while any list does.
  const isVisible = (key: NewCallFieldKey): boolean => {
    if (key === NewCallFieldKeys.DispatchList) {
      const listRuled = DISPATCH_LIST_KEYS.some((listKey) => ruleFor(listKey) !== undefined);

      return listRuled ? DISPATCH_LIST_KEYS.some((listKey) => isVisible(listKey)) : (ruleFor(key)?.Visible ?? true);
    }

    const rule = ruleFor(key);

    if (rule) return rule.Visible;

    return isDispatchListKey(key) ? (ruleFor(NewCallFieldKeys.DispatchList)?.Visible ?? true) : true;
  };

  // A hidden field is never required: requiring something nobody can fill in would block call creation.
  const isRequired = (key: NewCallFieldKey): boolean => {
    const rule = ruleFor(key);

    return !!rule && rule.Required && canBeRequired(key) && isVisible(key);
  };

  const missingRequired = (values: PolicyFieldValues): NewCallFieldKey[] => {
    const missing: NewCallFieldKey[] = [];

    for (const lowerKey of byKey.keys()) {
      const key = CANONICAL_KEYS.get(lowerKey);

      if (!key || !isRequired(key)) continue;

      if (!hasFieldValue(values[key])) missing.push(key);
    }

    return missing;
  };

  return { isVisible, isRequired, missingRequired, isLoaded };
}

/**
 * True when the department hides every recipient list (Core `AreAllDispatchTargetsHidden`): the call forms then offer no
 * picker, only an optional All Call (off by default), and the "dispatch list required" rule does not apply.
 */
export const areAllDispatchListsHidden = (policy: Pick<NewCallFieldPolicy, 'isVisible'>): boolean => !DISPATCH_LIST_KEYS.some((key) => policy.isVisible(key));

/** The canonical policy key for a key in any casing (a stored rule, a server message), or undefined for one this build does not know. */
export const toNewCallFieldKey = (key: string | null | undefined): NewCallFieldKey | undefined => (key ? CANONICAL_KEYS.get(key.trim().toLowerCase()) : undefined);

/**
 * The fields named the way the form names them, joined for a message (Dispatch `describeCallFields`). A key this build
 * does not know (a custom field's label, a newer server's key) is shown as-is rather than dropped.
 */
export const describeCallFields = (keys: readonly string[], t: (key: string) => string): string =>
  keys
    .map((key) => {
      const canonical = toNewCallFieldKey(key);

      return canonical ? t(FIELD_LABEL_KEYS[canonical]) : key;
    })
    .join(', ');

/** Translation keys for the policy field names (shown in "Your department requires …"). */
export const FIELD_LABEL_KEYS: Record<NewCallFieldKey, string> = {
  address: 'calls.address',
  geolocation: 'calls.coordinates',
  what3words: 'calls.what3words',
  pluscode: 'calls.plus_code',
  destinationPoi: 'calls.destination_poi',
  indoorLocation: 'calls.indoor_location',
  mapPage: 'calls.map_page',
  note: 'calls.note',
  contactName: 'calls.contact_name',
  contactInfo: 'calls.contact_info',
  primaryContact: 'site_info.primary_contact',
  additionalContacts: 'calls.additional_contacts',
  externalId: 'call_detail.external_id',
  incidentId: 'calls.incident_id',
  referenceId: 'call_detail.reference_id',
  protocols: 'call_detail.tabs.protocols',
  linkedCall: 'calls.linked_call',
  dispatchPersonnel: 'calls.users',
  dispatchGroups: 'calls.groups',
  dispatchRoles: 'calls.roles',
  dispatchUnits: 'calls.units',
  dispatchList: 'calls.dispatch_to',
  checkInTimers: 'calls.check_in_timers',
  part2Consent: 'calls.part2_consent',
  dispatchOn: 'calls.dispatch_on',
  pendingCall: 'calls.scheduling.pending',
};
