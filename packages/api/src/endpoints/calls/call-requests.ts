import type { CloseCallInput, CloseCallResult, EditCallInput, NewCallInput, ReleasePersonnelResult, ReleaseUnitResult, SaveCallResult, UdfFieldValueInput, UpdateDispatchTimeInput } from '@resgrid/models';

import { type ApiContext, type RequestOptions } from '../../core';
import { closeCall, editCall, releasePersonnel, releaseUnit, saveCall, updateScheduledDispatchTime } from './calls';

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
 * A DispatchList that dispatches nobody. Core reads a blank list as "everyone" on an immediate SaveCall and on an
 * EditCall whose dispatch list the department shows (older clients send none), so a call the dispatcher sends to no one
 * goes up as a list with no entries: not blank, and nothing in it resolves to a person, group, role or unit.
 */
export const DISPATCH_LIST_NOBODY = '|';

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

/** A point picked on the form (the free destination), sent like `Geolocation`. */
export interface CallRequestPoint {
  latitude: number;
  longitude: number;
}

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
  /**
   * The dispatcher picked the recipients (the form showed the dispatch list, or the All Call switch that replaces it when
   * the department hides every list), so an empty selection goes up as DISPATCH_LIST_NOBODY: nobody, or on an edit with
   * every list hidden, the recipients the call already has. Unset, an empty selection goes up blank: "everyone" on an immediate create,
   * and on an edit whose dispatch list the department hides, "keep the call's dispatches".
   */
  dispatchPicked?: boolean;
  callFormData?: string;
  /** Linked call (numeric id). Undefined omits it (no picker: the server does not enforce "linked call required"). */
  linkedCallId?: string;
  /** Protocol ids. Undefined omits them (no picker); an array, even empty, is sent and enforced. */
  protocolIds?: number[];
  /** The call's incident number (Call.IncidentNumber), not the linked call. */
  incidentId?: string;
  externalId?: string;
  referenceId?: string;
  /**
   * The map book page. Undefined goes up as null (the client has no input, so the server does not enforce "map page
   * required"); a string, even blank, is sent and enforced. On an edit, null or blank keeps the stored page.
   */
  mapPage?: string;
  /** Dispatch time as an ISO-8601 UTC instant (`DispatchOnUtc`); blank dispatches now (create) or keeps the schedule (edit). */
  dispatchOnUtc?: string;
  destinationPoiId?: number | null;
  /**
   * The POI (any type) the call location was picked from (Core M0322; the server fills a blank address / geolocation from it).
   * Undefined leaves the property out: the form has no Location POI picker, and an edit keeps the stored POI. Null (the picker
   * is shown, nothing picked) is left out of a new call and clears the POI on an edit (sent as 0).
   */
  locationPoiId?: number | null;
  /**
   * The free destination (Core M0322), for a destination that is not a POI. A destination POI (`destinationPoiId` > 0) wins:
   * the server clears the free destination then, so a new call leaves it out and an edit sends it cleared. Undefined leaves a
   * property out (the form has no input for it; an edit keeps the stored value); null or blank is left out of a new call and
   * clears the value on an edit (""). A plus code is only a lookup (`Geocoding/PlusCodeLookup`), never sent.
   */
  destinationAddress?: string | null;
  /** The free destination point, sent as `"lat,lon"` like `Geolocation` (an unusable point counts as blank). */
  destinationGeolocation?: CallRequestPoint | null;
  destinationWhat3Words?: string | null;
  /**
   * The pre-defined route (Core M0322): an eligible plan id from `Routes/GetCallRoutePlans`. Undefined leaves it out (no Route
   * picker; an edit keeps the stored route); null or blank is left out of a new call and clears the route on an edit ("").
   */
  routePlanId?: string | null;
  /** Conditional run cards: "unitId:codeId" joined by "|"; sent only when set. */
  unitResponseCodes?: string;
  /** Custom field values; undefined omits them (the server then does not check required fields). */
  udfValues?: UdfFieldValueInput[];
  /**
   * The indoor location: an indoor map zone or a custom map region (`IndoorMapZoneId`), with the floor or layer it is on.
   * Undefined leaves both out — the form has no indoor picker, so the server does not enforce the department's indoor
   * location requirement, and an edit keeps the stored one. Null or blank is sent as "": a new call has none (and the
   * requirement applies), an edit clears it.
   */
  indoorMapZoneId?: string | null;
  /** The indoor floor or custom map layer of `indoorMapZoneId`; sent with it. */
  indoorMapFloorId?: string | null;
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

const dispatchListFor = (request: CallRequestBase): string => {
  const list = buildDispatchList({ everyone: request.dispatchEveryone, users: request.dispatchUsers, groups: request.dispatchGroups, roles: request.dispatchRoles, units: request.dispatchUnits });

  return list || (request.dispatchPicked ? DISPATCH_LIST_NOBODY : '');
};

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
  MapPage: request.mapPage ?? null,
  ...(request.unitResponseCodes ? { UnitResponseCodes: request.unitResponseCodes } : {}),
  ...(Array.isArray(request.udfValues) ? { UdfValues: request.udfValues.map((value) => ({ UdfFieldId: value.UdfFieldId, Value: value.Value })) } : {}),
});

type IndoorLocationInput = Pick<NewCallInput, 'IndoorMapZoneId' | 'IndoorMapFloorId'>;

/** The indoor location, when the form shows its picker: the zone and its floor, or "" for both (none / cleared). */
const indoorLocationFields = (request: CallRequestBase): IndoorLocationInput => {
  if (request.indoorMapZoneId === undefined) return {};
  const zoneId = request.indoorMapZoneId?.trim() ?? '';

  return { IndoorMapZoneId: zoneId, IndoorMapFloorId: zoneId ? (request.indoorMapFloorId?.trim() ?? '') : '' };
};

type CallLocationInput = Pick<NewCallInput, 'LocationPoiId' | 'DestinationAddress' | 'DestinationGeolocation' | 'DestinationWhat3Words' | 'RoutePlanId'>;

/** A value the form shows: trimmed; blank is left out of a new call (undefined) and clears the stored value on an edit (""). */
const shownText = (value: string | null | undefined, isEdit: boolean): string | undefined => {
  const text = value?.trim() ?? '';

  return text !== '' || isEdit ? text : undefined;
};

/**
 * Core M0322 location fields. Only what the form shows goes up (`undefined` request fields are left out, so legacy-style
 * edits never change them); an edit clears with 0 / "" (null keeps the stored value on the server).
 */
const callLocationFields = (request: CallRequestBase, isEdit: boolean): CallLocationInput => {
  const fields: CallLocationInput = {};
  const destinationIsPoi = (request.destinationPoiId ?? 0) > 0;

  if (request.locationPoiId !== undefined) {
    const poiId = request.locationPoiId !== null && request.locationPoiId > 0 ? request.locationPoiId : 0;

    if (poiId > 0 || isEdit) fields.LocationPoiId = poiId;
  }

  const address = request.destinationAddress === undefined ? undefined : shownText(destinationIsPoi ? null : request.destinationAddress, isEdit);

  if (address !== undefined) fields.DestinationAddress = address;

  const point = request.destinationGeolocation;
  const geolocation = point === undefined ? undefined : shownText(destinationIsPoi || point === null ? null : formatGeolocation(point.latitude, point.longitude), isEdit);

  if (geolocation !== undefined) fields.DestinationGeolocation = geolocation;

  const what3words = request.destinationWhat3Words === undefined ? undefined : shownText(destinationIsPoi ? null : request.destinationWhat3Words, isEdit);

  if (what3words !== undefined) fields.DestinationWhat3Words = what3words;

  const routePlanId = request.routePlanId === undefined ? undefined : shownText(request.routePlanId, isEdit);

  if (routePlanId !== undefined) fields.RoutePlanId = routePlanId;

  return fields;
};

export const buildNewCallInput = (request: CreateCallRequest): NewCallInput => ({
  ...commonFields(request),
  ...callLocationFields(request, false),
  ...indoorLocationFields(request),
  // Only when a time was picked; a pending call has no dispatch time.
  ...(!request.isPending && request.dispatchOnUtc ? { DispatchOnUtc: request.dispatchOnUtc } : {}),
  IsPending: request.isPending === true,
  ...(request.runCardOutcomeNodeKey ? { RunCardOutcomeNodeKey: request.runCardOutcomeNodeKey } : {}),
});

export const buildEditCallInput = (request: UpdateCallRequest): EditCallInput => ({
  Id: request.callId,
  ...commonFields(request),
  ...callLocationFields(request, true),
  ...indoorLocationFields(request),
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

/** What a release takes off a call: a unit, or one person. */
export type ReleaseResourceKind = 'unit' | 'personnel';

export interface ReleaseFromCallRequest {
  kind: ReleaseResourceKind;
  callId: string;
  /** The unit's id, or the person's user id. */
  resourceId: string;
  /** Send the released unit or person a cancellation notice for the call. */
  notify: boolean;
}

/** Releases (stands down) a unit (`Calls/ReleaseUnit`) or a person (`Calls/ReleasePersonnel`) from an open call that stays open. */
export const releaseFromCallWith = (ctx: ApiContext, release: ReleaseFromCallRequest, options?: RequestOptions): Promise<ReleaseUnitResult | ReleasePersonnelResult> =>
  release.kind === 'unit'
    ? releaseUnit(ctx, { CallId: release.callId, UnitId: release.resourceId, Notify: release.notify }, options)
    : releasePersonnel(ctx, { CallId: release.callId, UserId: release.resourceId, Notify: release.notify }, options);
