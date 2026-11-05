import type { UpdateCallRequest } from '@resgrid/api';
import type { CallResultData, DispatchedEventResultData } from '@resgrid/models';
import { richTextForSave, richTextToPlain } from '@resgrid/ui';

import { dispatchKind } from './call-dispatch';

/** Who a call goes to, as the dispatch picker produces it. An empty selection dispatches nobody; "everyone" is its own switch. */
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

const BUCKETS = { personnel: 'users', group: 'groups', role: 'roles', unit: 'units' } as const;

/** A call's current dispatches as a picker selection: the edit form's start, a pending call's proposed recipients, the base of "dispatch more". */
export function dispatchesToSelection(dispatches: readonly DispatchedEventResultData[] | null | undefined): DispatchSelection {
  const selection: DispatchSelection = { everyone: false, users: [], groups: [], roles: [], units: [] };

  for (const dispatch of dispatches ?? []) {
    const kind = dispatch?.Id ? dispatchKind(dispatch.Type) : 'other';

    if (kind === 'other') continue;
    const bucket = selection[BUCKETS[kind]];

    if (!bucket.includes(dispatch.Id)) bucket.push(dispatch.Id);
  }

  return selection;
}

/**
 * Unions newly picked resources with existing ones. Keeps "dispatch more" purely additive: existing dispatches are never
 * read as removed by the server's EditCall diff, so only the new resources are notified.
 */
export function mergeDispatchSelections(existing: DispatchSelection, added: DispatchSelection): DispatchSelection {
  if (existing.everyone || added.everyone) return { everyone: true, users: [], groups: [], roles: [], units: [] };
  const union = (a: readonly string[], b: readonly string[]): string[] => Array.from(new Set([...a, ...b]));

  return { everyone: false, users: union(existing.users, added.users), groups: union(existing.groups, added.groups), roles: union(existing.roles, added.roles), units: union(existing.units, added.units) };
}

/** Recipients in a selection; "everyone" counts as one. */
export const selectionSize = (selection: DispatchSelection): number => (selection.everyone ? 1 : selection.users.length + selection.groups.length + selection.roles.length + selection.units.length);

const coordinatesOf = (call: CallResultData): Pick<UpdateCallRequest, 'latitude' | 'longitude'> => {
  const [lat, lon] = call.Latitude && call.Longitude ? [call.Latitude, call.Longitude] : (call.Geolocation ?? '').split(',');
  const latitude = Number(lat);
  const longitude = Number(lon);

  return lat && lon && Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {};
};

/**
 * A call's text sent back as it stands. Core's sanitizer entity-encodes name, nature and note on the way out (`&amp;`),
 * and sending that back would store the entity: plain text goes back decoded, rich text (the web's nature and note) as
 * stored.
 */
const storedPlainText = (value: string | null | undefined): string => richTextToPlain(value ?? '');
const storedRichText = (value: string | null | undefined): string => richTextForSave(storedPlainText(value), value);

/**
 * The EditCall request that adds `added` to a call while preserving everything else (Dispatch
 * `buildAddResourcesUpdateRequest`). The picked resources are unioned with the call's CURRENT dispatches, so nothing is
 * un-dispatched and the server notifies only the new resources (RebroadcastCall stays false). Linked call and protocols
 * are left out (no picker here: EditCall then neither changes nor enforces them); CallFormData is threaded through so it
 * is not blanked.
 */
export function buildAddResourcesRequest(call: CallResultData, current: DispatchSelection, added: DispatchSelection, extras: { callFormData?: string; unitResponseCodes?: string } = {}): UpdateCallRequest {
  const merged = mergeDispatchSelections(current, added);

  const request: UpdateCallRequest = {
    callId: call.CallId,
    name: storedPlainText(call.Name),
    nature: storedRichText(call.Nature),
    note: storedRichText(call.Note),
    address: call.Address,
    ...coordinatesOf(call),
    priority: call.Priority,
    type: call.Type,
    contactName: call.ContactName,
    contactInfo: call.ContactInfo,
    what3words: call.What3Words,
    callFormData: extras.callFormData,
    destinationPoiId: call.DestinationPoiId,
    referenceId: call.ReferenceId,
    externalId: call.ExternalId,
    incidentId: call.IncidentId,
    dispatchUsers: merged.users,
    dispatchGroups: merged.groups,
    dispatchRoles: merged.roles,
    dispatchUnits: merged.units,
    dispatchEveryone: merged.everyone,
    dispatchPicked: true,
  };

  if (extras.unitResponseCodes) request.unitResponseCodes = extras.unitResponseCodes;

  return request;
}
