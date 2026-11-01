import type { CloseCallInput, CloseCallResult, EditCallInput, NewCallInput, SaveCallResult, UdfFieldValueInput, UpdateDispatchTimeInput } from '@resgrid/models';

import { type ApiContext, type RequestOptions } from '../../core';
import { closeCall, editCall, saveCall, updateScheduledDispatchTime } from './calls';

/**
 * Call save/edit request builders (Dispatch baseline, omni-plan §7.2). They encode the server's "missing property
 * means this client has no picker for it" rules, so screens pass camelCase form state and never hand-build bodies.
 */

/** Who to dispatch, in the shape the dispatch picker produces. */
export interface DispatchListSelection {
  everyone?: boolean;
  users?: readonly string[];
  groups?: readonly string[];
  roles?: readonly string[];
  units?: readonly string[];
}

/**
 * The server's DispatchList string: "0" for everyone, otherwise "|"-joined `P:` (personnel), `G:` (group), `R:` (role)
 * and `U:` (unit) entries. An empty selection yields an empty string.
 */
export const buildDispatchList = (selection: DispatchListSelection): string => {
  if (selection.everyone) {
    return '0';
  }
  const entries: string[] = [];
  for (const user of selection.users ?? []) entries.push(`P:${user}`);
  for (const group of selection.groups ?? []) entries.push(`G:${group}`);
  for (const role of selection.roles ?? []) entries.push(`R:${role}`);
  for (const unit of selection.units ?? []) entries.push(`U:${unit}`);
  return entries.join('|');
};

/**
 * The `Geolocation` wire value: `"lat,lon"`, or empty when there is no usable fix. Never a bare `","` — the server
 * takes any non-empty value as the location and skips geocoding the typed address. Mirrors Core's coordinate check:
 * both finite, on the globe, and not 0,0 (a single zero is a real place and is kept).
 */
export const formatGeolocation = (latitude?: number | null, longitude?: number | null): string => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '';
  }
  if (latitude === 0 && longitude === 0) {
    return '';
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return '';
  }
  return `${latitude},${longitude}`;
};

interface CallRequestBase {
  name: string;
  nature: string;
  note?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  priority: number;
  type?: string;
  contactName?: string;
  contactInfo?: string;
  /** Primary Contact to link; undefined leaves the property out. */
  contactId?: string | null;
  /** Additional Contacts; on edit, supplying either contact field replaces the links. */
  additionalContactIds?: string[];
  what3words?: string;
  dispatchUsers?: string[];
  dispatchGroups?: string[];
  dispatchRoles?: string[];
  dispatchUnits?: string[];
  dispatchEveryone?: boolean;
  callFormData?: string;
  /** Linked call (numeric id). Undefined omits it (no picker: the server does not enforce "linked call required"). */
  linkedCallId?: string;
  /** Protocol ids. Undefined omits them (no picker); an array, even empty, is sent and enforced. */
  protocolIds?: number[];
  /** The call's incident number (Call.IncidentNumber), not the linked call. */
  incidentId?: string;
  externalId?: string;
  referenceId?: string;
  /** Dispatch time as an ISO-8601 UTC instant (`DispatchOnUtc`); blank dispatches now (create) or keeps the schedule (edit). */
  dispatchOnUtc?: string;
  destinationPoiId?: number | null;
  /** Conditional run cards: "unitId:codeId" joined by "|"; sent only when set. */
  unitResponseCodes?: string;
  /** Custom field values; undefined omits them (the server then does not check required fields). */
  udfValues?: UdfFieldValueInput[];
}

export interface CreateCallRequest extends CallRequestBase {
  /** Save as Pending (State 8): nobody is notified and `dispatchOnUtc` is not sent. */
  isPending?: boolean;
  /** Conditional run cards: the reviewed recommendation's Decision.OutcomeNodeKey; sent only when set. */
  runCardOutcomeNodeKey?: string;
}

export interface UpdateCallRequest extends CallRequestBase {
  callId: string;
  /** Re-send the dispatch to everyone currently dispatched. */
  rebroadcastCall?: boolean;
  /** Notify entities removed from the dispatch list by this edit. */
  notifyCancelledEntities?: boolean;
}

export interface CloseCallRequest {
  callId: string;
  /** CallStates value the call closes as. */
  type: number;
  note?: string;
  /** Alert everyone attached to the call that it closed; omitted when unset (server default). */
  sendNotification?: boolean;
}

const dispatchListFor = (request: CallRequestBase): string =>
  buildDispatchList({ everyone: request.dispatchEveryone, users: request.dispatchUsers, groups: request.dispatchGroups, roles: request.dispatchRoles, units: request.dispatchUnits });

const commonFields = (request: CallRequestBase) => ({
  Name: request.name,
  Nature: request.nature,
  Note: request.note || '',
  Address: request.address || '',
  DestinationPoiId: request.destinationPoiId ?? null,
  Geolocation: formatGeolocation(request.latitude, request.longitude),
  Priority: request.priority,
  Type: request.type || '',
  ContactName: request.contactName || '',
  ContactInfo: request.contactInfo || '',
  ...(request.contactId !== undefined ? { ContactId: request.contactId || '' } : {}),
  ...(request.additionalContactIds !== undefined ? { AdditionalContactIds: request.additionalContactIds } : {}),
  What3Words: request.what3words || '',
  DispatchList: dispatchListFor(request),
  CallFormData: request.callFormData || '',
  IncidentId: request.incidentId || '',
  ...(typeof request.linkedCallId === 'string' ? { LinkedCallId: request.linkedCallId } : {}),
  ...(Array.isArray(request.protocolIds) ? { ProtocolIds: request.protocolIds } : {}),
  ExternalId: request.externalId || '',
  ReferenceId: request.referenceId || '',
  ...(request.unitResponseCodes ? { UnitResponseCodes: request.unitResponseCodes } : {}),
  ...(Array.isArray(request.udfValues) ? { UdfValues: request.udfValues.map((value) => ({ UdfFieldId: value.UdfFieldId, Value: value.Value })) } : {}),
});

export const buildNewCallInput = (request: CreateCallRequest): NewCallInput => ({
  ...commonFields(request),
  // Only when a time was picked; a pending call has no dispatch time.
  ...(!request.isPending && request.dispatchOnUtc ? { DispatchOnUtc: request.dispatchOnUtc } : {}),
  IsPending: request.isPending === true,
  ...(request.runCardOutcomeNodeKey ? { RunCardOutcomeNodeKey: request.runCardOutcomeNodeKey } : {}),
});

export const buildEditCallInput = (request: UpdateCallRequest): EditCallInput => ({
  Id: request.callId,
  ...commonFields(request),
  // Only when a new time was picked: leaving it out keeps the schedule.
  ...(request.dispatchOnUtc ? { DispatchOnUtc: request.dispatchOnUtc } : {}),
  RebroadcastCall: request.rebroadcastCall ?? false,
  NotifyCancelledEntities: request.notifyCancelledEntities ?? false,
});

export const buildCloseCallInput = (request: CloseCallRequest): CloseCallInput => ({
  Id: request.callId,
  Type: request.type,
  Notes: request.note || '',
  ...(request.sendNotification !== undefined ? { SendNotification: request.sendNotification } : {}),
});

/** Creates a call (`Calls/SaveCall`) from form state. */
export const createCall = (ctx: ApiContext, request: CreateCallRequest, options?: RequestOptions): Promise<SaveCallResult> => saveCall(ctx, buildNewCallInput(request), options);

/** Edits a call (`Calls/EditCall`; Core has no `UpdateCall`). */
export const updateCall = (ctx: ApiContext, request: UpdateCallRequest, options?: RequestOptions): Promise<SaveCallResult> => editCall(ctx, buildEditCallInput(request), options);

/** Closes a call (`Calls/CloseCall`). */
export const closeCallWith = (ctx: ApiContext, request: CloseCallRequest, options?: RequestOptions): Promise<CloseCallResult> => closeCall(ctx, buildCloseCallInput(request), options);

/** Reschedules a not-yet-dispatched scheduled call; `date` is the department-local dispatch date/time. */
export const rescheduleCallDispatch = (ctx: ApiContext, callId: string, date: string, options?: RequestOptions): Promise<SaveCallResult> => {
  const body: UpdateDispatchTimeInput = { Id: callId, Date: date };
  return updateScheduledDispatchTime(ctx, body, options);
};
