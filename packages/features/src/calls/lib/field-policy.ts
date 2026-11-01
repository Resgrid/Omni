import { type NewCallFieldKey, NewCallFieldKeys, type NewCallFieldRuleData } from '@resgrid/models';

/**
 * The department's new-call field policy (`Calls/GetNewCallFieldPolicy`, Dispatch `useNewCallFieldPolicy`): hide the
 * fields the department does not use and refuse to submit until the fields it requires have values. Fail-open: no
 * rules (unreachable, offline, older server) keeps the stock form — the server enforces the same policy on save.
 */
export interface NewCallFieldPolicy {
  isVisible: (key: NewCallFieldKey) => boolean;
  isRequired: (key: NewCallFieldKey) => boolean;
  /** Required fields left blank, given the current form values. Empty = the form may submit. */
  missingRequired: (values: Partial<Record<NewCallFieldKey, unknown>>) => NewCallFieldKey[];
  isLoaded: boolean;
}

const CANONICAL_KEYS = new Map<string, NewCallFieldKey>(Object.values(NewCallFieldKeys).map((key) => [key.toLowerCase(), key]));

/** A plus code only locates the call while it is entered and is never stored: it can be hidden, never required. */
const NEVER_REQUIRED_KEYS = new Set<NewCallFieldKey>([NewCallFieldKeys.PlusCode]);

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

  const isVisible = (key: NewCallFieldKey): boolean => byKey.get(key.toLowerCase())?.Visible ?? true;
  // A hidden field is never required: requiring something nobody can fill in would block call creation.
  const isRequired = (key: NewCallFieldKey): boolean => {
    const rule = byKey.get(key.toLowerCase());
    return !!rule && rule.Visible && rule.Required && !NEVER_REQUIRED_KEYS.has(key);
  };
  const missingRequired = (values: Partial<Record<NewCallFieldKey, unknown>>): NewCallFieldKey[] => {
    const missing: NewCallFieldKey[] = [];
    for (const [lowerKey, rule] of byKey) {
      const key = CANONICAL_KEYS.get(lowerKey);
      if (!key || !rule.Visible || !rule.Required || NEVER_REQUIRED_KEYS.has(key)) continue;
      if (!hasFieldValue(values[key])) missing.push(key);
    }
    return missing;
  };
  return { isVisible, isRequired, missingRequired, isLoaded };
}

/** Translation keys for the policy field names (shown in "Your department requires …"). */
export const FIELD_LABEL_KEYS: Record<NewCallFieldKey, string> = {
  address: 'calls.address',
  geolocation: 'calls.coordinates',
  what3words: 'calls.what3words',
  pluscode: 'calls.plus_code',
  destinationPoi: 'calls.destination_poi',
  indoorLocation: 'calls.indoor_location',
  note: 'calls.note',
  contactName: 'calls.contact_name',
  contactInfo: 'calls.contact_info',
  externalId: 'call_detail.external_id',
  incidentId: 'calls.incident_id',
  referenceId: 'call_detail.reference_id',
  protocols: 'call_detail.tabs.protocols',
  linkedCall: 'calls.linked_call',
  dispatchOn: 'calls.dispatch_on',
  dispatchList: 'calls.dispatch_to',
};
