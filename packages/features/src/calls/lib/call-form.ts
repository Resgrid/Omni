import type { CreateCallRequest, UpdateCallRequest } from '@resgrid/api';
import { type CallResultData, type DispatchedEventResultData, type NewCallFieldKey, NewCallFieldKeys, type UdfFieldResultData, type UdfFieldValueInput } from '@resgrid/models';

import { dispatchKind } from './call-dispatch';
import { hasFieldValue, type NewCallFieldPolicy } from './field-policy';

/** Who a call goes to, as the dispatch picker produces it. A blank selection pages everyone (never for pending calls). */
export interface DispatchSelection {
  everyone: boolean;
  users: string[];
  groups: string[];
  roles: string[];
  units: string[];
}

export const EMPTY_DISPATCH_SELECTION: DispatchSelection = { everyone: false, users: [], groups: [], roles: [], units: [] };

export const dispatchSelectionCount = (selection: DispatchSelection): number => selection.users.length + selection.groups.length + selection.roles.length + selection.units.length;

export const isDispatchSelectionEmpty = (selection: DispatchSelection): boolean => !selection.everyone && dispatchSelectionCount(selection) === 0;

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
  /** "lat, lon" as typed (or set from the map / a POI / a contact). */
  coordinates: string;
  what3words: string;
  priority: number | null;
  type: string;
  contactName: string;
  contactInfo: string;
  contactId: string | null;
  externalId: string;
  referenceId: string;
  incidentId: string;
  destinationPoiId: number | null;
  linkedCall: LinkedCallRef | null;
  protocolIds: number[];
  dispatch: DispatchSelection;
  /** ISO-8601 UTC dispatch time (`DispatchOnUtc`); blank dispatches now. */
  dispatchOnUtc: string;
  /** Save as Pending (State 8): nobody is notified (Dispatch queues). */
  isPending: boolean;
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
  coordinates: '',
  what3words: '',
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
  udfValues: [],
  runCardOutcomeNodeKey: '',
  unitResponseCodes: '',
});

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

/** Which optional pickers this form renders: a property the client has no picker for is left out of the request. */
export interface CallFormPickers {
  protocols: boolean;
  linkedCall: boolean;
  udf: boolean;
  contact: boolean;
}

export type CallFormErrorKey = 'name' | 'nature' | 'priority' | 'coordinates' | 'dispatchOnUtc' | 'udf' | NewCallFieldKey;

export interface CallFormValidation {
  errors: Partial<Record<CallFormErrorKey, string>>;
  /** Policy fields left blank (shown as "Your department requires …"). */
  missingPolicyFields: NewCallFieldKey[];
  missingUdfFields: string[];
  isValid: boolean;
}

/** Values keyed by policy field, for `missingRequired`. */
export function policyValues(values: CallFormValues): Partial<Record<NewCallFieldKey, unknown>> {
  return {
    [NewCallFieldKeys.Address]: values.address,
    [NewCallFieldKeys.Geolocation]: parseCoordinates(values.coordinates).ok,
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

const UDF_EMPTY = (value: string | undefined): boolean => !hasFieldValue(value);

export function missingRequiredUdfFields(fields: readonly UdfFieldResultData[], values: readonly UdfFieldValueInput[]): string[] {
  return fields.filter((field) => field.IsEnabled && field.IsRequired && !field.IsReadOnly && UDF_EMPTY(values.find((value) => value.UdfFieldId === field.UdfFieldId)?.Value)).map((field) => field.UdfFieldId);
}

/** Form validation: name, nature and a priority, coordinates that parse, the field policy and required custom fields. */
export function validateCallForm(values: CallFormValues, options: { policy: NewCallFieldPolicy; udfFields?: readonly UdfFieldResultData[] | null; validPriorityIds: readonly number[] }): CallFormValidation {
  const errors: Partial<Record<CallFormErrorKey, string>> = {};
  if (!values.name.trim()) errors.name = 'calls.validation.name_required';
  if (!values.nature.trim()) errors.nature = 'calls.validation.nature_required';
  if (values.priority === null || (options.validPriorityIds.length > 0 && !options.validPriorityIds.includes(values.priority))) errors.priority = 'calls.invalid_priority';
  if (values.coordinates.trim()) {
    const parsed = parseCoordinates(values.coordinates);
    if (!parsed.ok) errors.coordinates = parsed.reason === 'out_of_range' ? 'calls.coordinates_out_of_range' : 'calls.coordinates_invalid_format';
  }
  if (values.dispatchOnUtc && !values.isPending && Number.isNaN(Date.parse(values.dispatchOnUtc))) errors.dispatchOnUtc = 'calls.validation.dispatch_on_invalid';
  const missingPolicyFields = options.policy.missingRequired(policyValues(values));
  for (const key of missingPolicyFields) errors[key] = 'calls.validation.required';
  const missingUdfFields = options.udfFields ? missingRequiredUdfFields(options.udfFields, values.udfValues) : [];
  if (missingUdfFields.length > 0) errors.udf = 'calls.validation.udf_required';
  return { errors, missingPolicyFields, missingUdfFields, isValid: Object.keys(errors).length === 0 };
}

const optional = (value: string): string | undefined => (value.trim() ? value.trim() : undefined);

const coordinatesOf = (values: CallFormValues): { latitude?: number; longitude?: number } => {
  const parsed = parseCoordinates(values.coordinates);
  return parsed.ok ? { latitude: parsed.latitude, longitude: parsed.longitude } : {};
};

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
  dispatchEveryone: values.dispatch.everyone,
  dispatchUsers: values.dispatch.users,
  dispatchGroups: values.dispatch.groups,
  dispatchRoles: values.dispatch.roles,
  dispatchUnits: values.dispatch.units,
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
  return {
    ...commonRequestFields(values, pickers),
    ...(values.isPending ? { isPending: true } : values.dispatchOnUtc ? { dispatchOnUtc: values.dispatchOnUtc } : {}),
    ...(values.runCardOutcomeNodeKey ? { runCardOutcomeNodeKey: values.runCardOutcomeNodeKey } : {}),
  };
}

/** Edit: every value the form holds is sent, hidden fields included (resgrid-domain: resend hidden values on edit). */
export function toUpdateCallRequest(callId: string, values: CallFormValues, pickers: CallFormPickers, options: { rebroadcast?: boolean } = {}): UpdateCallRequest {
  return {
    callId,
    ...commonRequestFields(values, pickers),
    ...(values.dispatchOnUtc ? { dispatchOnUtc: values.dispatchOnUtc } : {}),
    rebroadcastCall: options.rebroadcast ?? false,
  };
}

/** The call's current dispatch list as a picker selection (edit). */
export function dispatchSelectionFromDispatches(dispatches: readonly DispatchedEventResultData[]): DispatchSelection {
  const selection: DispatchSelection = { everyone: false, users: [], groups: [], roles: [], units: [] };
  for (const dispatch of dispatches) {
    if (!dispatch.Id) continue;
    switch (dispatchKind(dispatch.Type)) {
      case 'personnel':
        if (!selection.users.includes(dispatch.Id)) selection.users.push(dispatch.Id);
        break;
      case 'group':
        if (!selection.groups.includes(dispatch.Id)) selection.groups.push(dispatch.Id);
        break;
      case 'role':
        if (!selection.roles.includes(dispatch.Id)) selection.roles.push(dispatch.Id);
        break;
      case 'unit':
        if (!selection.units.includes(dispatch.Id)) selection.units.push(dispatch.Id);
        break;
      default:
        break;
    }
  }
  return selection;
}

const coordinateString = (latitude: string | number | null | undefined, longitude: string | number | null | undefined): string => {
  const lat = typeof latitude === 'number' ? latitude : Number(latitude);
  const lon = typeof longitude === 'number' ? longitude : Number(longitude);
  if (latitude === '' || longitude === '' || latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  if (lat === 0 && lon === 0) return '';
  return formatCoordinates(lat, lon);
};

const udfInputs = (values: readonly unknown[] | undefined): UdfFieldValueInput[] =>
  (values ?? []).flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const record = value as { UdfFieldId?: unknown; Value?: unknown };
    return typeof record.UdfFieldId === 'string' ? [{ UdfFieldId: record.UdfFieldId, Value: typeof record.Value === 'string' ? record.Value : String(record.Value ?? '') }] : [];
  });

/** Edit: the form starts from the call as loaded, including fields the policy hides. */
export function callToFormValues(call: CallResultData, dispatches: readonly DispatchedEventResultData[] = []): CallFormValues {
  const [lat, lon] = (call.Geolocation ?? '').split(',');
  const coordinates = coordinateString(call.Latitude || lat, call.Longitude || lon);
  const protocolIds = (call.Protocols ?? []).flatMap((protocol) => {
    const id = protocol && typeof protocol === 'object' ? Number((protocol as { Id?: unknown; ProtocolId?: unknown }).Id ?? (protocol as { ProtocolId?: unknown }).ProtocolId) : NaN;
    return Number.isFinite(id) ? [id] : [];
  });
  return {
    ...emptyCallFormValues(call.Priority),
    name: call.Name ?? '',
    nature: call.Nature ?? '',
    note: call.Note ?? '',
    address: call.Address ?? '',
    coordinates,
    what3words: call.What3Words ?? '',
    type: call.Type === 'No Type' ? '' : (call.Type ?? ''),
    contactName: call.ContactName ?? '',
    contactInfo: call.ContactInfo ?? '',
    contactId: call.Contacts?.[0]?.ContactId ?? null,
    externalId: call.ExternalId ?? '',
    referenceId: call.ReferenceId ?? '',
    incidentId: call.IncidentId ?? '',
    destinationPoiId: call.DestinationPoiId ?? null,
    protocolIds,
    dispatch: dispatchSelectionFromDispatches(dispatches),
    udfValues: udfInputs(call.UdfValues),
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
    coordinates: typeof request.latitude === 'number' && typeof request.longitude === 'number' ? formatCoordinates(request.latitude, request.longitude) : '',
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
