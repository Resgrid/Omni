/**
 * Recognising a protected value the server declined to decrypt (ADP plan 7.2). The authoritative signal is the
 * `RedactedFields` list the server returns beside the record; the literal sentinel in the value is the fallback for
 * payloads that carry no list (a member can legitimately type "REDACTED" into a note, so the list wins). Unit's copy.
 */

/** The exact sentinel the server substitutes. Compare with strict equality; never localize or display it raw. */
export const REDACTION_VALUE = 'REDACTED';

/** Catalog field ids, matching the server's protected-field catalog. */
export const ProtectedFieldIds = {
  callName: 'calls.name',
  callNature: 'calls.natureofcall',
  callNotes: 'calls.notes',
  callAddress: 'calls.address',
  callContactName: 'calls.contactname',
  callContactNumber: 'calls.contactnumber',
  callGeolocation: 'calls.geolocationdata',
  callWhat3Words: 'calls.w3w',

  contactFirstName: 'contacts.firstname',
  contactLastName: 'contacts.lastname',
  contactCompanyName: 'contacts.companyname',
  contactEmail: 'contacts.email',
  contactHomePhone: 'contacts.homephonenumber',
  contactCellPhone: 'contacts.cellphonenumber',

  callNote: 'callnotes.note',

  personnelIdentificationNumber: 'departmentmembersensitivedata.identificationnumber',
  personnelNotes: 'departmentmembersensitivedata.notes',
  personnelHomeAddress: 'departmentmembersensitivedata.homeaddress1',
  personnelMailingAddress: 'departmentmembersensitivedata.mailingaddress1',

  emergencyContactName: 'departmentmemberemergencycontacts.name',
  emergencyContactRelationship: 'departmentmemberemergencycontacts.relationship',
  emergencyContactPhone: 'departmentmemberemergencycontacts.phonenumber',
  emergencyContactEmail: 'departmentmemberemergencycontacts.email',

  unitLogNarrative: 'unitlogs.narrative',
  userStateNote: 'userstates.note',

  calendarTitle: 'calendaritems.title',
  calendarDescription: 'calendaritems.description',
  calendarLocation: 'calendaritems.location',
} as const;

export type ProtectedFieldId = (typeof ProtectedFieldIds)[keyof typeof ProtectedFieldIds];

/**
 * True when this field was withheld. `fieldId` is checked against the server's list whenever a list is present (an empty
 * list is a list: "nothing was withheld"); only an ABSENT list falls back to the sentinel value.
 */
export const isFieldRedacted = (redactedFields: readonly (string | null)[] | null | undefined, fieldId: string, value?: string | null): boolean => {
  if (redactedFields != null) {
    return redactedFields.some((field) => field?.toLowerCase() === fieldId.toLowerCase());
  }
  return value === REDACTION_VALUE;
};

/** True when a value is the bare sentinel, for surfaces with no field id to hand. Weaker than {@link isFieldRedacted}. */
export const isRedactedValue = (value?: string | null): boolean => value === REDACTION_VALUE;

/** The value for display, or null when it was withheld (render a shield / "protected" label instead — never the sentinel). */
export const revealedValue = (redactedFields: readonly (string | null)[] | null | undefined, fieldId: string, value: string | null | undefined): string | null =>
  isFieldRedacted(redactedFields, fieldId, value) ? null : (value ?? null);
