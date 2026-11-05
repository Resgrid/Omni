import { type CreateCallRequest, formatGeolocation, type UpdateCallRequest } from '@resgrid/api';
import { isFieldRedacted, type ProtectedFieldId, ProtectedFieldIds, REDACTION_VALUE } from '@resgrid/auth';
import {
  type CallQuickTemplateResultData,
  type CallResultData,
  type CallTypeResultData,
  type DispatchedEventResultData,
  type NewCallFieldKey,
  NewCallFieldKeys,
  type UdfFieldResultData,
  type UdfFieldValueInput,
} from '@resgrid/models';
import { richTextForSave, richTextToPlain } from '@resgrid/ui';

import { getScheduledDispatchPrefill, isDispatchTimeTooSoon, toDispatchOnUtc } from './call-schedule';
import { CallState, scheduledDispatchUtc } from './call-time';
import { dispatchesToSelection, type DispatchSelection, EMPTY_DISPATCH_SELECTION, isDispatchSelectionEmpty } from './dispatch-selection';
import { hasFieldValue, type NewCallFieldPolicy, type PolicyFieldValues } from './field-policy';

export { type DispatchSelection, dispatchSelectionCount, EMPTY_DISPATCH_SELECTION, isDispatchSelectionEmpty } from './dispatch-selection';

export interface LinkedCallRef {
  callId: string;
  number: string;
  name: string;
}

export interface CallFormValues {
  name: string;
  nature: string;
  note: string;
  address: string;
  /** Decimal degrees as typed (or set from the map, a lookup or a contact), -90 to 90. */
  latitude: string;
  /** Decimal degrees as typed (or set with the latitude), -180 to 180. */
  longitude: string;
  what3words: string;
  /** Locates the call while it is entered (server lookup) and is never stored on it. */
  plusCode: string;
  priority: number | null;
  type: string;
  contactName: string;
  contactInfo: string;
  contactId: string | null;
  externalId: string;
  referenceId: string;
  incidentId: string;
  destinationPoiId: number | null;
  /** Create: the call's link. Edit: a link this edit adds (EditCall keeps the links a call has and cannot remove one). */
  linkedCall: LinkedCallRef | null;
  /** Create: the call's protocols. Edit: protocols this edit adds (EditCall cannot remove the ones attached). */
  protocolIds: number[];
  dispatch: DispatchSelection;
  /** ISO-8601 UTC dispatch time (`DispatchOnUtc`); blank dispatches now (create) or keeps the schedule (edit). */
  dispatchOnUtc: string;
  /** Save as Pending (State 8): nobody is notified (Dispatch queues). */
  isPending: boolean;
  /** Edit: tell the resources this edit takes off the dispatch list that they were stood down. */
  notifyCancelledEntities: boolean;
  udfValues: UdfFieldValueInput[];
  /** Conditional run cards (hook point). */
  runCardOutcomeNodeKey: string;
  unitResponseCodes: string;
}

export const emptyCallFormValues = (priority: number | null = null): CallFormValues => ({
  name: '',
  nature: '',
  note: '',
  address: '',
  latitude: '',
  longitude: '',
  what3words: '',
  plusCode: '',
  priority,
  type: '',
  contactName: '',
  contactInfo: '',
  contactId: null,
  externalId: '',
  referenceId: '',
  incidentId: '',
  destinationPoiId: null,
  linkedCall: null,
  protocolIds: [],
  dispatch: EMPTY_DISPATCH_SELECTION,
  dispatchOnUtc: '',
  isPending: false,
  notifyCancelledEntities: false,
  udfValues: [],
  runCardOutcomeNodeKey: '',
  unitResponseCodes: '',
});

/**
 * Who a new call is dispatched to, as the form shows and saves it. A pending call is not offered "Everyone" (the
 * dispatcher who sends it picks its recipients), so while the Pending switch is on an "Everyone" pick counts as nobody.
 * The pick itself stays in the form: turning Pending off again brings it back.
 */
export const callDispatchSelection = (values: Pick<CallFormValues, 'dispatch' | 'isPending'>): DispatchSelection => (values.isPending && values.dispatch.everyone ? EMPTY_DISPATCH_SELECTION : values.dispatch);

export type CoordinateParse = { ok: true; latitude: number; longitude: number } | { ok: false; reason: 'empty' | 'invalid_format' | 'out_of_range' };

/** "lat, lon" (comma or whitespace separated). Accepts 0 on one axis; the API drops 0,0 on its own. */
export function parseCoordinates(input: string): CoordinateParse {
  const trimmed = input.trim();

  if (!trimmed) return { ok: false, reason: 'empty' };
  const parts = trimmed.split(/[\s,]+/).filter(Boolean);

  if (parts.length !== 2) return { ok: false, reason: 'invalid_format' };
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, reason: 'invalid_format' };

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return { ok: false, reason: 'out_of_range' };

  return { ok: true, latitude, longitude };
}

export const formatCoordinates = (latitude: number, longitude: number): string => `${latitude}, ${longitude}`;

export type CoordinateValueParse = { ok: true; value: number } | { ok: false; reason: 'empty' | 'invalid_format' | 'out_of_range' };

/** A plain decimal number of degrees: no separators, units or hemisphere letters. */
const DECIMAL_DEGREES = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

const parseDegrees = (input: string, limit: number): CoordinateValueParse => {
  const trimmed = input.trim();

  if (!trimmed) return { ok: false, reason: 'empty' };

  if (!DECIMAL_DEGREES.test(trimmed)) return { ok: false, reason: 'invalid_format' };
  const value = Number(trimmed);

  return Math.abs(value) > limit ? { ok: false, reason: 'out_of_range' } : { ok: true, value };
};

/** A latitude field: decimal degrees, -90 to 90. */
export const parseLatitude = (input: string): CoordinateValueParse => parseDegrees(input, 90);

/** A longitude field: decimal degrees, -180 to 180. */
export const parseLongitude = (input: string): CoordinateValueParse => parseDegrees(input, 180);

/** The point the latitude and longitude fields give: both valid, or why not (both blank is `empty`). */
export function parseCoordinateFields(latitude: string, longitude: string): CoordinateParse {
  const lat = parseLatitude(latitude);
  const lon = parseLongitude(longitude);

  if (lat.ok && lon.ok) return { ok: true, latitude: lat.value, longitude: lon.value };

  if (!lat.ok && !lon.ok && lat.reason === 'empty' && lon.reason === 'empty') return { ok: false, reason: 'empty' };
  const outOfRange = [lat, lon].some((parse) => !parse.ok && parse.reason === 'out_of_range');

  // One field without the other is not a point either.
  return { ok: false, reason: outOfRange ? 'out_of_range' : 'invalid_format' };
}

export type CoordinateFieldErrors = Partial<Record<'latitude' | 'longitude', string>>;

const coordinateError = (parse: CoordinateValueParse, invalidKey: string): string | undefined => {
  if (parse.ok) return undefined;

  return parse.reason === 'empty' ? 'calls.coordinates_incomplete' : invalidKey;
};

/**
 * The latitude and longitude fields' errors: blank together is no location; otherwise each must be decimal degrees in
 * range, and one filled needs the other.
 */
export function coordinateFieldErrors(latitude: string, longitude: string): CoordinateFieldErrors {
  const lat = parseLatitude(latitude);
  const lon = parseLongitude(longitude);

  if (!lat.ok && !lon.ok && lat.reason === 'empty' && lon.reason === 'empty') return {};
  const errors: CoordinateFieldErrors = {};
  const latitudeError = coordinateError(lat, 'calls.latitude_invalid');
  const longitudeError = coordinateError(lon, 'calls.longitude_invalid');

  if (latitudeError) errors.latitude = latitudeError;

  if (longitudeError) errors.longitude = longitudeError;

  return errors;
}

/** A point as the latitude and longitude fields hold it. */
export const toCoordinateFields = (latitude: number, longitude: number): Pick<CallFormValues, 'latitude' | 'longitude'> => ({ latitude: String(latitude), longitude: String(longitude) });

/** Which optional pickers this form renders: a property the client has no picker for is left out of the request. */
export interface CallFormPickers {
  protocols: boolean;
  linkedCall: boolean;
  udf: boolean;
  contact: boolean;
  /** The dispatch list is shown: the selection is exactly who the call goes to, so an empty one dispatches nobody. */
  dispatchList: boolean;
}

export type CallFormErrorKey = 'name' | 'nature' | 'priority' | 'type' | 'latitude' | 'longitude' | 'dispatchOnUtc' | 'udf' | NewCallFieldKey;

export interface CallFormValidation {
  errors: Partial<Record<CallFormErrorKey, string>>;
  /** Policy fields left blank (shown as "Your department requires …"). */
  missingPolicyFields: NewCallFieldKey[];
  missingUdfFields: string[];
  /** A picked dispatch time closer than the lead time (its own message). */
  dispatchTooSoon: boolean;
  isValid: boolean;
}

/** The edit form's text fields that Advanced Data Protection can withhold. */
export type WithheldEditField = 'name' | 'nature' | 'note' | 'address' | 'coordinates' | 'what3words' | 'contactName' | 'contactInfo';

const PROTECTED_EDIT_FIELDS = [
  { key: 'name', fieldId: ProtectedFieldIds.callName, stored: (call: CallResultData) => call.Name },
  { key: 'nature', fieldId: ProtectedFieldIds.callNature, stored: (call: CallResultData) => call.Nature },
  { key: 'note', fieldId: ProtectedFieldIds.callNotes, stored: (call: CallResultData) => call.Note },
  { key: 'address', fieldId: ProtectedFieldIds.callAddress, stored: (call: CallResultData) => call.Address },
  { key: 'coordinates', fieldId: ProtectedFieldIds.callGeolocation, stored: (call: CallResultData) => call.Geolocation },
  { key: 'what3words', fieldId: ProtectedFieldIds.callWhat3Words, stored: (call: CallResultData) => call.What3Words },
  { key: 'contactName', fieldId: ProtectedFieldIds.callContactName, stored: (call: CallResultData) => call.ContactName },
  { key: 'contactInfo', fieldId: ProtectedFieldIds.callContactNumber, stored: (call: CallResultData) => call.ContactInfo },
] as const satisfies readonly { key: WithheldEditField; fieldId: ProtectedFieldId; stored: (call: CallResultData) => string | null | undefined }[];

/**
 * Edit: the fields ADP withheld from the call as loaded. The form shows them locked (never the REDACTED sentinel as
 * text to edit) and the save leaves them as the call stores them; a reveal re-reads the call and unlocks them.
 */
export const withheldEditFields = (call: CallResultData): ReadonlySet<WithheldEditField> =>
  new Set(PROTECTED_EDIT_FIELDS.flatMap(({ key, fieldId, stored }) => (isFieldRedacted(call.RedactedFields, fieldId, stored(call)) ? [key] : [])));

/** Edit: the call the form was loaded from, which decides what EditCall keeps and which requirements apply. */
export interface CallFormEditContext {
  call: CallResultData;
  /** Protocols already attached to the call, or null when they could not be read. */
  storedProtocolCount: number | null;
  /** The dispatch time the form started with: only a different one is sent and checked. */
  initialDispatchOnUtc: string;
}

const coordinatesAsGeolocation = (values: Pick<CallFormValues, 'latitude' | 'longitude'>): string => {
  const parsed = parseCoordinateFields(values.latitude, values.longitude);

  return parsed.ok ? formatGeolocation(parsed.latitude, parsed.longitude) : '';
};

/** Values keyed by policy field, for `missingRequired`. A location counts as Core counts it (a single zero does; 0,0 does not). */
export function policyValues(values: CallFormValues): PolicyFieldValues {
  return {
    [NewCallFieldKeys.Address]: values.address,
    [NewCallFieldKeys.Geolocation]: coordinatesAsGeolocation(values),
    [NewCallFieldKeys.What3Words]: values.what3words,
    [NewCallFieldKeys.DestinationPoi]: values.destinationPoiId,
    [NewCallFieldKeys.Note]: values.note,
    [NewCallFieldKeys.ContactName]: values.contactName,
    [NewCallFieldKeys.ContactInfo]: values.contactInfo,
    [NewCallFieldKeys.ExternalId]: values.externalId,
    [NewCallFieldKeys.IncidentId]: values.incidentId,
    [NewCallFieldKeys.ReferenceId]: values.referenceId,
    [NewCallFieldKeys.Protocols]: values.protocolIds,
    [NewCallFieldKeys.LinkedCall]: values.linkedCall?.callId,
    [NewCallFieldKeys.DispatchOn]: values.dispatchOnUtc,
    [NewCallFieldKeys.DispatchList]: !isDispatchSelectionEmpty(values.dispatch),
  };
}

/** EditCall keeps the stored value for a blank text input, so blank means "what the call already has". */
const textOrStored = (value: string, stored: string | null | undefined): string => (value.trim() ? value : (stored ?? ''));

const storedGeolocation = (call: CallResultData): string => {
  const [lat, lon] = (call.Geolocation ?? '').split(',');
  const fromCoordinates = formatGeolocation(call.Latitude ? Number(call.Latitude) : undefined, call.Longitude ? Number(call.Longitude) : undefined);

  return fromCoordinates || formatGeolocation(lat ? Number(lat) : undefined, lon ? Number(lon) : undefined);
};

/**
 * Edit: the policy values the edit is checked against (Dispatch `getEditCallFieldValues`) — what the form submits,
 * merged with what the call already stores wherever EditCall keeps the stored value (a blank text input, protocols
 * already attached). The dispatch list is what the form submits: an empty selection dispatches nobody, so a required
 * list needs someone picked.
 */
export function editPolicyValues(values: CallFormValues, edit: CallFormEditContext): PolicyFieldValues {
  const { call } = edit;
  // A withheld point is still the call's point: the requirement is met by what is stored.
  const geolocationWithheld = withheldEditFields(call).has('coordinates');

  return {
    [NewCallFieldKeys.Note]: textOrStored(values.note, call.Note),
    [NewCallFieldKeys.Address]: textOrStored(values.address, call.Address),
    [NewCallFieldKeys.Geolocation]: coordinatesAsGeolocation(values) || (geolocationWithheld ? REDACTION_VALUE : storedGeolocation(call)),
    [NewCallFieldKeys.What3Words]: textOrStored(values.what3words, call.What3Words),
    [NewCallFieldKeys.ContactName]: textOrStored(values.contactName, call.ContactName),
    [NewCallFieldKeys.ContactInfo]: textOrStored(values.contactInfo, call.ContactInfo),
    [NewCallFieldKeys.ExternalId]: textOrStored(values.externalId, call.ExternalId),
    [NewCallFieldKeys.IncidentId]: textOrStored(values.incidentId, call.IncidentId),
    [NewCallFieldKeys.ReferenceId]: textOrStored(values.referenceId, call.ReferenceId),
    [NewCallFieldKeys.DestinationPoi]: values.destinationPoiId,
    [NewCallFieldKeys.Protocols]: (edit.storedProtocolCount ?? 0) > 0 || values.protocolIds.length > 0,
    [NewCallFieldKeys.LinkedCall]: !!values.linkedCall,
    [NewCallFieldKeys.DispatchList]: !isDispatchSelectionEmpty(values.dispatch),
  };
}

/**
 * The required fields the form leaves blank, by the rules Core applies (Dispatch new-call and `getEditCallMissingFields`):
 * - indoor location is never enforced (no indoor picker here, and the server skips it when no zone is sent);
 * - a pending call is not dispatched or scheduled yet, so neither its dispatch list nor its dispatch time is required;
 * - on an edit the dispatch time is never required, the linked call is left to the server (it sees the links the call
 *   already has) and protocols are not judged when the attached ones could not be read.
 */
export function missingPolicyFields(values: CallFormValues, policy: NewCallFieldPolicy, edit: CallFormEditContext | null = null): NewCallFieldKey[] {
  const isPending = edit ? edit.call.State === CallState.Pending : values.isPending;

  return policy.missingRequired(edit ? editPolicyValues(values, edit) : policyValues(values)).filter((key) => {
    switch (key) {
      case NewCallFieldKeys.IndoorLocation:
        return false;
      case NewCallFieldKeys.DispatchOn:
        return !edit && !isPending;
      case NewCallFieldKeys.DispatchList:
        return !isPending;
      case NewCallFieldKeys.LinkedCall:
        return !edit;
      case NewCallFieldKeys.Protocols:
        return !edit || edit.storedProtocolCount !== null;
      default:
        return true;
    }
  });
}

/** A custom field the form shows (Dispatch `isUdfFieldShown`): enabled and on mobile, or required — a call cannot be saved without it. */
export const isUdfFieldShown = (field: Pick<UdfFieldResultData, 'IsEnabled' | 'IsVisibleOnMobile' | 'IsRequired'>): boolean => field.IsEnabled && (field.IsVisibleOnMobile || field.IsRequired);

/** Required custom fields left blank (whitespace is blank, as on the server, which refuses the save the same way). */
export function missingRequiredUdfFields(fields: readonly UdfFieldResultData[], values: readonly UdfFieldValueInput[]): string[] {
  return fields.filter((field) => isUdfFieldShown(field) && field.IsRequired && !hasFieldValue(values.find((value) => value.UdfFieldId === field.UdfFieldId)?.Value)).map((field) => field.UdfFieldId);
}

export interface CallFormValidationOptions {
  policy: NewCallFieldPolicy;
  udfFields?: readonly UdfFieldResultData[] | null;
  validPriorityIds: readonly number[];
  /** The department's call type names: when it has any, the call needs one of them (Dispatch). */
  validTypeNames?: readonly string[];
  /** Edit: the call as loaded. */
  edit?: CallFormEditContext | null;
  now?: number;
}

/** The dispatch time this save sends: a pending call has none, and an edit sends only a newly picked one. */
const pickedDispatchOn = (values: CallFormValues, edit: CallFormEditContext | null | undefined): string => {
  if (edit) return values.dispatchOnUtc && values.dispatchOnUtc !== edit.initialDispatchOnUtc ? values.dispatchOnUtc : '';

  return values.isPending ? '' : values.dispatchOnUtc;
};

/**
 * Form validation (Dispatch new/edit call): name, nature, a valid priority and — when the department has types — a type;
 * coordinates that parse; a scheduled dispatch far enough ahead; the field policy and required custom fields.
 */
export function validateCallForm(values: CallFormValues, options: CallFormValidationOptions): CallFormValidation {
  const errors: Partial<Record<CallFormErrorKey, string>> = {};
  const validTypeNames = options.validTypeNames ?? [];
  // A withheld name or nature is locked on the form and kept as stored by the save, so it is not blank.
  const withheld = options.edit ? withheldEditFields(options.edit.call) : new Set<WithheldEditField>();

  if (!withheld.has('name') && !values.name.trim()) errors.name = 'calls.validation.name_required';

  if (!withheld.has('nature') && !values.nature.trim()) errors.nature = 'calls.validation.nature_required';

  if (values.priority === null || (options.validPriorityIds.length > 0 && !options.validPriorityIds.includes(values.priority))) errors.priority = 'calls.invalid_priority';

  if (validTypeNames.length > 0 && !validTypeNames.includes(values.type)) errors.type = values.type ? 'calls.invalid_type' : 'calls.validation.type_required';

  // A withheld point is locked on the form and kept as stored by the save.
  const coordinateErrors = withheld.has('coordinates') ? {} : coordinateFieldErrors(values.latitude, values.longitude);

  if (coordinateErrors.latitude) errors.latitude = coordinateErrors.latitude;

  if (coordinateErrors.longitude) errors.longitude = coordinateErrors.longitude;

  const dispatchOn = pickedDispatchOn(values, options.edit);
  const dispatchTooSoon = !!dispatchOn && !Number.isNaN(Date.parse(dispatchOn)) && isDispatchTimeTooSoon(dispatchOn, options.now);

  if (dispatchOn && Number.isNaN(Date.parse(dispatchOn))) errors.dispatchOnUtc = 'calls.validation.dispatch_on_invalid';
  else if (dispatchTooSoon) errors.dispatchOnUtc = 'calls.dispatch_on_too_soon';

  const missingPolicy = missingPolicyFields(values, options.policy, options.edit ?? null);

  for (const key of missingPolicy) errors[key] = 'calls.validation.required';
  const missingUdfFields = options.udfFields ? missingRequiredUdfFields(options.udfFields, values.udfValues) : [];

  if (missingUdfFields.length > 0) errors.udf = 'calls.validation.udf_required';

  return { errors, missingPolicyFields: missingPolicy, missingUdfFields, dispatchTooSoon, isValid: Object.keys(errors).length === 0 };
}

const optional = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

const coordinatesOf = (values: CallFormValues): { latitude?: number; longitude?: number } => {
  const parsed = parseCoordinateFields(values.latitude, values.longitude);

  return parsed.ok ? { latitude: parsed.latitude, longitude: parsed.longitude } : {};
};

/** The request's dispatch list, field by field. */
const dispatchRequestFields = (dispatch: DispatchSelection) => ({
  dispatchEveryone: dispatch.everyone,
  dispatchUsers: dispatch.users,
  dispatchGroups: dispatch.groups,
  dispatchRoles: dispatch.roles,
  dispatchUnits: dispatch.units,
});

const commonRequestFields = (values: CallFormValues, pickers: CallFormPickers) => ({
  name: values.name.trim(),
  nature: values.nature.trim(),
  note: values.note,
  address: values.address.trim(),
  ...coordinatesOf(values),
  priority: values.priority ?? 0,
  type: values.type,
  contactName: values.contactName,
  contactInfo: values.contactInfo,
  ...(pickers.contact ? { contactId: values.contactId } : {}),
  what3words: values.what3words,
  ...dispatchRequestFields(callDispatchSelection(values)),
  dispatchPicked: pickers.dispatchList,
  ...(pickers.linkedCall ? { linkedCallId: values.linkedCall?.callId ?? '' } : {}),
  ...(pickers.protocols ? { protocolIds: values.protocolIds } : {}),
  incidentId: optional(values.incidentId),
  externalId: optional(values.externalId),
  referenceId: optional(values.referenceId),
  destinationPoiId: values.destinationPoiId,
  ...(values.unitResponseCodes ? { unitResponseCodes: values.unitResponseCodes } : {}),
  ...(pickers.udf ? { udfValues: values.udfValues } : {}),
});

export function toCreateCallRequest(values: CallFormValues, pickers: CallFormPickers): CreateCallRequest {
  const dispatchOnUtc = values.isPending ? undefined : toDispatchOnUtc(values.dispatchOnUtc);

  return {
    ...commonRequestFields(values, pickers),
    ...(values.isPending ? { isPending: true } : dispatchOnUtc ? { dispatchOnUtc } : {}),
    ...(values.runCardOutcomeNodeKey ? { runCardOutcomeNodeKey: values.runCardOutcomeNodeKey } : {}),
  };
}

/**
 * Leaves every field the policy hides exactly as the call stores it (Dispatch `keepHiddenEditFieldsUnchanged`). A hidden
 * field has no input, so what the form holds for it is not the dispatcher's choice:
 * - text fields go up blank, which EditCall reads as "keep the stored value";
 * - no point is posted for a hidden location, so the stored one stays;
 * - the destination is sent as stored (a missing one clears it on servers that do not yet ignore hidden fields);
 * - protocols and linked call are left out, which tells the server this edit does not touch them;
 * - no dispatch time is sent, which keeps the call's schedule.
 * The dispatch list needs nothing here: with its picker hidden the request is not marked as picked, so an empty
 * selection goes up blank and EditCall keeps the call's dispatches.
 */
export function keepHiddenEditFieldsUnchanged(request: UpdateCallRequest, isVisible: (key: NewCallFieldKey) => boolean, call: CallResultData): UpdateCallRequest {
  const next: UpdateCallRequest = { ...request };

  if (!isVisible(NewCallFieldKeys.Note)) next.note = '';

  if (!isVisible(NewCallFieldKeys.Address)) next.address = '';

  if (!isVisible(NewCallFieldKeys.Geolocation)) {
    next.latitude = undefined;
    next.longitude = undefined;
  }

  if (!isVisible(NewCallFieldKeys.What3Words)) next.what3words = '';

  if (!isVisible(NewCallFieldKeys.ContactName)) next.contactName = '';

  if (!isVisible(NewCallFieldKeys.ContactInfo)) next.contactInfo = '';

  if (!isVisible(NewCallFieldKeys.ExternalId)) next.externalId = '';

  if (!isVisible(NewCallFieldKeys.IncidentId)) next.incidentId = '';

  if (!isVisible(NewCallFieldKeys.ReferenceId)) next.referenceId = '';

  if (!isVisible(NewCallFieldKeys.DestinationPoi)) next.destinationPoiId = call.DestinationPoiId ?? null;

  if (!isVisible(NewCallFieldKeys.Protocols)) next.protocolIds = undefined;

  if (!isVisible(NewCallFieldKeys.LinkedCall)) next.linkedCallId = undefined;

  if (!isVisible(NewCallFieldKeys.DispatchOn)) next.dispatchOnUtc = undefined;

  return next;
}

/**
 * Leaves every field ADP withheld exactly as the call stores it. The form never held its value, so what it holds for
 * the field is not the dispatcher's choice:
 * - name and nature go up as the REDACTED sentinel: EditCall overwrites both unconditionally, and Core restores the
 *   stored value for a round-tripped sentinel;
 * - the other text fields go up blank, which EditCall reads as "keep the stored value" (a sentinel address would read
 *   as a new address and drop the call's point);
 * - no point is posted for a withheld location, so the stored one stays.
 */
export function keepWithheldEditFieldsUnchanged(request: UpdateCallRequest, call: CallResultData): UpdateCallRequest {
  const withheld = withheldEditFields(call);
  const next: UpdateCallRequest = { ...request };

  if (withheld.has('name')) next.name = REDACTION_VALUE;

  if (withheld.has('nature')) next.nature = REDACTION_VALUE;

  if (withheld.has('note')) next.note = '';

  if (withheld.has('address')) next.address = '';

  if (withheld.has('coordinates')) {
    next.latitude = undefined;
    next.longitude = undefined;
  }

  if (withheld.has('what3words')) next.what3words = '';

  if (withheld.has('contactName')) next.contactName = '';

  if (withheld.has('contactInfo')) next.contactInfo = '';

  return next;
}

export interface UpdateCallRequestOptions {
  edit: CallFormEditContext;
  isVisible: (key: NewCallFieldKey) => boolean;
  rebroadcast?: boolean;
}

/**
 * Edit (Dispatch edit call): protocols and a linked call are added (EditCall keeps what the call has), a dispatch time
 * goes up only when a different one was picked, the primary contact only when another one was picked (sending it
 * replaces the call's contact links), and fields the policy hides are left as the call stores them.
 */
export function toUpdateCallRequest(callId: string, values: CallFormValues, pickers: CallFormPickers, options: UpdateCallRequestOptions): UpdateCallRequest {
  const { contactId, ...common } = commonRequestFields(values, pickers);
  const dispatchOnUtc = toDispatchOnUtc(pickedDispatchOn(values, options.edit));
  const contactChanged = contactId !== undefined && (contactId ?? null) !== (options.edit.call.Contacts?.[0]?.ContactId ?? null);
  const { call } = options.edit;

  const request: UpdateCallRequest = {
    callId,
    ...common,
    // The form edits these as plain text; a call whose nature or note the web wrote as rich text keeps it (and its formatting) unless the text changed.
    nature: richTextForSave(common.nature, call.Nature),
    note: richTextForSave(common.note, call.Note),
    notifyCancelledEntities: values.notifyCancelledEntities,
    rebroadcastCall: options.rebroadcast ?? false,
  };

  if (contactChanged) request.contactId = contactId;

  if (dispatchOnUtc) request.dispatchOnUtc = dispatchOnUtc;

  return keepWithheldEditFieldsUnchanged(keepHiddenEditFieldsUnchanged(request, options.isVisible, call), call);
}

/** The call's current dispatch list as a picker selection (edit). */
export const dispatchSelectionFromDispatches = (dispatches: readonly DispatchedEventResultData[]): DispatchSelection => dispatchesToSelection(dispatches);

const NO_COORDINATES: Pick<CallFormValues, 'latitude' | 'longitude'> = { latitude: '', longitude: '' };

/** The call's stored point as the form's fields, blank when it has none (0,0 is no point). */
const storedCoordinateFields = (latitude: string | number | null | undefined, longitude: string | number | null | undefined): Pick<CallFormValues, 'latitude' | 'longitude'> => {
  const lat = typeof latitude === 'number' ? latitude : Number(latitude);
  const lon = typeof longitude === 'number' ? longitude : Number(longitude);

  if (latitude === '' || longitude === '' || latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return NO_COORDINATES;

  if (lat === 0 && lon === 0) return NO_COORDINATES;

  return toCoordinateFields(lat, lon);
};

const udfInputs = (values: readonly unknown[] | undefined): UdfFieldValueInput[] =>
  (values ?? []).flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const record = value as { UdfFieldId?: unknown; Value?: unknown };

    return typeof record.UdfFieldId === 'string' ? [{ UdfFieldId: record.UdfFieldId, Value: typeof record.Value === 'string' ? record.Value : String(record.Value ?? '') }] : [];
  });

/**
 * The department's name for the call's type (Dispatch edit): `Call.Type` is the type's text, so newer servers' `TypeId`
 * is matched first (it still finds a renamed type) and the name after it; ids compare as text (one can arrive as a
 * number). Blank for "No Type" and a type the department no longer has.
 */
export function callTypeName(call: Pick<CallResultData, 'Type' | 'TypeId'>, types: readonly Pick<CallTypeResultData, 'Id' | 'Name'>[]): string {
  const byId = call.TypeId ? types.find((type) => String(type.Id) === String(call.TypeId)) : undefined;
  const byName = types.find((type) => type.Name === call.Type);
  const name = byId?.Name ?? byName?.Name ?? (types.length === 0 ? (call.Type ?? '') : '');

  return name === 'No Type' ? '' : name;
}

/**
 * Edit: the form starts from the call as loaded, including fields the policy hides. Protocols and the linked call start
 * empty (an edit only adds them); the dispatch time starts as the stored one only while the call is still scheduled.
 */
/** The form fields that hold each protectable field (the point is two). */
const WITHHELD_FORM_FIELDS = {
  name: ['name'],
  nature: ['nature'],
  note: ['note'],
  address: ['address'],
  coordinates: ['latitude', 'longitude'],
  what3words: ['what3words'],
  contactName: ['contactName'],
  contactInfo: ['contactInfo'],
} as const satisfies Record<WithheldEditField, readonly (keyof CallFormValues)[]>;

export type ProtectedFormField = (typeof WITHHELD_FORM_FIELDS)[WithheldEditField][number];

/** The form fields a withheld protectable field locks. */
export const withheldFormFields = (field: WithheldEditField): readonly ProtectedFormField[] => WITHHELD_FORM_FIELDS[field];

/**
 * The protectable fields as the form holds them: what the call stores, or blank where ADP withheld it (never the
 * sentinel). Name, nature and note come through Core's HTML sanitizer, and the web writes nature and note as rich text,
 * so the form gets them as plain text (line breaks kept, tags dropped, `&amp;` decoded) — never markup to edit.
 */
const protectedEditValues = (call: CallResultData): Pick<CallFormValues, ProtectedFormField> => {
  const withheld = withheldEditFields(call);
  const [lat, lon] = (call.Geolocation ?? '').split(',');
  const shown = (key: WithheldEditField, value: string | null | undefined): string => (withheld.has(key) ? '' : (value ?? ''));
  const shownText = (key: WithheldEditField, value: string | null | undefined): string => richTextToPlain(shown(key, value));
  const point = withheld.has('coordinates') ? NO_COORDINATES : storedCoordinateFields(call.Latitude || lat, call.Longitude || lon);

  return {
    name: shownText('name', call.Name),
    nature: shownText('nature', call.Nature),
    note: shownText('note', call.Note),
    address: shown('address', call.Address),
    latitude: point.latitude,
    longitude: point.longitude,
    what3words: shown('what3words', call.What3Words),
    contactName: shown('contactName', call.ContactName),
    contactInfo: shown('contactInfo', call.ContactInfo),
  };
};

export function callToFormValues(call: CallResultData, dispatches: readonly DispatchedEventResultData[] = [], options: { types?: readonly Pick<CallTypeResultData, 'Id' | 'Name'>[]; now?: number } = {}): CallFormValues {
  return {
    ...emptyCallFormValues(call.Priority),
    ...protectedEditValues(call),
    type: callTypeName(call, options.types ?? []),
    contactId: call.Contacts?.[0]?.ContactId ?? null,
    externalId: call.ExternalId ?? '',
    referenceId: call.ReferenceId ?? '',
    incidentId: call.IncidentId ?? '',
    destinationPoiId: call.DestinationPoiId ?? null,
    dispatch: dispatchSelectionFromDispatches(dispatches),
    dispatchOnUtc: getScheduledDispatchPrefill(scheduledDispatchUtc(call), options.now),
    udfValues: udfInputs(call.UdfValues),
  };
}

/**
 * Edit: the form after a reveal or a conceal re-read the call. A field that was withheld and is readable now starts from
 * its stored value; a field withheld now is emptied, so its plaintext leaves the form when the grant ends; every other
 * field keeps what the dispatcher typed.
 */
export function syncWithheldEditFields(values: CallFormValues, call: CallResultData, wasWithheld: ReadonlySet<WithheldEditField>): CallFormValues {
  const withheld = withheldEditFields(call);
  const stored = protectedEditValues(call);
  const next = { ...values };

  for (const { key } of PROTECTED_EDIT_FIELDS) {
    for (const field of WITHHELD_FORM_FIELDS[key]) {
      if (withheld.has(key)) next[field] = '';
      else if (wasWithheld.has(key)) next[field] = stored[field];
    }
  }

  return next;
}

/**
 * A call quick template applied to the form (Dispatch): its name, nature, type and a priority the department still has
 * replace the form's; a blank template field leaves the form's value. The web writes a template's nature as rich text,
 * so it goes in as plain text.
 */
export function applyCallTemplate(values: CallFormValues, template: CallQuickTemplateResultData, validPriorityIds: readonly number[]): CallFormValues {
  return {
    ...values,
    name: template.CallName || values.name,
    nature: (template.CallNature ? richTextToPlain(template.CallNature) : '') || values.nature,
    type: template.CallType || values.type,
    priority: validPriorityIds.includes(template.CallPriority) ? template.CallPriority : values.priority,
  };
}

/** Correction of a rejected queued call: the form starts from the request that was refused. */
export function createRequestToFormValues(request: CreateCallRequest): CallFormValues {
  return {
    ...emptyCallFormValues(request.priority),
    name: request.name,
    nature: request.nature,
    note: request.note ?? '',
    address: request.address ?? '',
    ...(typeof request.latitude === 'number' && typeof request.longitude === 'number' ? toCoordinateFields(request.latitude, request.longitude) : NO_COORDINATES),
    what3words: request.what3words ?? '',
    type: request.type ?? '',
    contactName: request.contactName ?? '',
    contactInfo: request.contactInfo ?? '',
    contactId: request.contactId ?? null,
    externalId: request.externalId ?? '',
    referenceId: request.referenceId ?? '',
    incidentId: request.incidentId ?? '',
    destinationPoiId: request.destinationPoiId ?? null,
    protocolIds: request.protocolIds ?? [],
    dispatch: {
      everyone: request.dispatchEveryone ?? false,
      users: [...(request.dispatchUsers ?? [])],
      groups: [...(request.dispatchGroups ?? [])],
      roles: [...(request.dispatchRoles ?? [])],
      units: [...(request.dispatchUnits ?? [])],
    },
    dispatchOnUtc: request.dispatchOnUtc ?? '',
    isPending: request.isPending ?? false,
    udfValues: request.udfValues ?? [],
    runCardOutcomeNodeKey: request.runCardOutcomeNodeKey ?? '',
    unitResponseCodes: request.unitResponseCodes ?? '',
  };
}
