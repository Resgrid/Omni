/**
 * The department's new-call form policy: which built-in fields the call form shows, and which it
 * requires before a call can be created and sent to the field.
 *
 * Mirrors Resgrid.Model.NewCallFieldKeys. Keys are stable strings rather than ordinals because they
 * are a wire contract shared by the web app and all five client apps.
 */

export const NewCallFieldKeys = {
  Address: 'address',
  Geolocation: 'geolocation',
  What3Words: 'what3words',
  PlusCode: 'pluscode',
  DestinationPoi: 'destinationPoi',
  IndoorLocation: 'indoorLocation',
  MapPage: 'mapPage',
  Note: 'note',
  ContactName: 'contactName',
  ContactInfo: 'contactInfo',
  /** The primary contact picker (Contacts module); v4 sends the pick as `ContactId`. */
  PrimaryContact: 'primaryContact',
  /** Hide only. */
  AdditionalContacts: 'additionalContacts',
  ExternalId: 'externalId',
  IncidentId: 'incidentId',
  ReferenceId: 'referenceId',
  Protocols: 'protocols',
  LinkedCall: 'linkedCall',
  /** Hide only: each of the four recipient lists of the Dispatch To selection can be hidden on its own. */
  DispatchPersonnel: 'dispatchPersonnel',
  DispatchGroups: 'dispatchGroups',
  DispatchRoles: 'dispatchRoles',
  DispatchUnits: 'dispatchUnits',
  /**
   * The recipients section as a whole: required means "at least one recipient". Core derives its visibility (shown while
   * any of the four lists is), so a client that knows only this key hides its picker exactly when every list is hidden.
   */
  DispatchList: 'dispatchList',
  /** Hide only. */
  CheckInTimers: 'checkInTimers',
  /** Hide only. */
  Part2Consent: 'part2Consent',
  DispatchOn: 'dispatchOn',
  /** Hide only: the "save as pending" switch. */
  PendingCall: 'pendingCall',
} as const;

export type NewCallFieldKey = (typeof NewCallFieldKeys)[keyof typeof NewCallFieldKeys];

export interface NewCallFieldRuleData {
  Key: string;
  Visible: boolean;
  Required: boolean;
}

export interface NewCallFieldPolicyResultData {
  Rules: NewCallFieldRuleData[];
}
