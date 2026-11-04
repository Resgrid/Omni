import { isFieldRedacted, ProtectedFieldIds } from '@resgrid/auth';

/** The call text fields Advanced Data Protection can withhold that screens show as a call's title and summary. */
const CALL_TEXT_FIELD_IDS = { Name: ProtectedFieldIds.callName, Nature: ProtectedFieldIds.callNature, Address: ProtectedFieldIds.callAddress } as const;

export type CallTextField = keyof typeof CALL_TEXT_FIELD_IDS;

/** Any call-shaped record: the full call, a location-history match, a queue row. */
export type CallTextFields = { readonly [K in CallTextField]?: string | null } & { readonly RedactedFields?: readonly (string | null)[] | null };

/**
 * The field's text, or null when ADP withheld it — for places that must show nothing rather than a label (map pins,
 * notification text). An empty field stays '' so a missing value is never mistaken for a protected one.
 */
export const revealedCallText = (call: CallTextFields, field: CallTextField): string | null => (isFieldRedacted(call.RedactedFields, CALL_TEXT_FIELD_IDS[field], call[field]) ? null : (call[field] ?? ''));

/** The field as a screen shows it: the localized protected label (`t('data_protection.protected_value')`) when withheld, never the wire sentinel. */
export const callDisplayText = (call: CallTextFields, field: CallTextField, protectedLabel: string): string => revealedCallText(call, field) ?? protectedLabel;

/** The call's name as every list, card, header and accessibility label shows it. */
export const callDisplayName = (call: CallTextFields, protectedLabel: string): string => callDisplayText(call, 'Name', protectedLabel);
