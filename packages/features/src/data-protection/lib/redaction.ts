import { isFieldRedacted, REDACTION_VALUE } from '@resgrid/auth';

/**
 * A record with every withheld value removed, plus the names of the fields that were withheld (Unit contacts
 * `withoutRedacted`, generalized). Screens then never show the sentinel as data or dial "tel:REDACTED"; they show the
 * protected label and offer the reveal. The server's RedactedFields list marks catalog fields; the sentinel is the
 * fallback for payloads without one.
 */
export const withoutRedacted = <T extends object>(record: T): T & { WithheldFields: string[] } => {
  const withheld: string[] = [];
  const copy: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    if (value === REDACTION_VALUE) {
      copy[key] = undefined;
      withheld.push(key);
    }
  }
  return { ...(copy as T), WithheldFields: withheld };
};

/** The value to show, or null when it was withheld (render ProtectedLabel instead). */
export const displayableValue = (value: string | null | undefined, fieldId?: string, redactedFields?: readonly (string | null)[] | null): string | null => {
  if (value == null || value === '') return null;
  if (fieldId ? isFieldRedacted(redactedFields, fieldId, value) : value === REDACTION_VALUE) return null;
  return value;
};
