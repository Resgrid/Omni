/**
 * Status destinations (Unit `lib/status-destination` + Responder `lib/status-destinations`): which destination kinds a
 * status offers, the call a status defaults to, and the RespondingTo/RespondingToType a selection sends. A status links
 * to a call only through its destination, so the summary line and the submit both read `resolveEffectiveDestination`.
 */
import { callDisplayName } from '@resgrid/features/calls/lib/call-display';
import { type CallResultData, DestinationEntityTypes, type GroupResultData, type PoiResultData, statusDetailAllowsCalls, statusDetailAllowsPois, statusDetailAllowsStations } from '@resgrid/models';

import { ActionBaseTypes } from './base-types';

export type DestinationTab = 'call' | 'station' | 'poi';

export type StatusDestination = { type: 'none' } | { type: 'call'; call: CallResultData } | { type: 'station'; station: GroupResultData } | { type: 'poi'; poi: PoiResultData };

export const NO_DESTINATION: StatusDestination = { type: 'none' };

export interface DestinationLists {
  calls: CallResultData[];
  stations: GroupResultData[];
  pois: PoiResultData[];
}

/** The destination tabs a status Detail offers. `lenient` = Unit's rule (older call-only values also allow stations/POIs). */
export const getDestinationTabs = (detail: number, lenient = false): DestinationTab[] => {
  const tabs: DestinationTab[] = [];

  if (statusDetailAllowsCalls(detail)) tabs.push('call');

  if (statusDetailAllowsStations(detail, { lenient })) tabs.push('station');

  if (statusDetailAllowsPois(detail, { lenient })) tabs.push('poi');

  return tabs;
};

/** What the subject's current status points at: its destination id and type (Unit status / personnel status shapes). */
export interface CurrentDestinationRef {
  DestinationId?: number | string | null;
  DestinationType?: number | string | null;
}

/**
 * The call id the current status points at, or null when it has no destination or points at a station/POI. Legacy rows
 * carry no type (null/0); the server treats an untyped destination as a call, so those count — callers still require
 * the id to match an open call.
 */
export const getCurrentStatusCallId = (current: CurrentDestinationRef | null | undefined): string | null => {
  if (!current) return null;
  const destinationId = current.DestinationId == null ? '' : String(current.DestinationId).trim();

  if (destinationId === '' || destinationId === '0') return null;
  const rawType = current.DestinationType;
  const type = rawType == null || rawType === '' ? DestinationEntityTypes.None : Number(rawType);

  return type === DestinationEntityTypes.Call || type === DestinationEntityTypes.None ? destinationId : null;
};

/**
 * The call a status defaults to: the active call when it is still open, otherwise the open call the current status
 * points at (dispatch writes a "Responding" status carrying the dispatched call). Null when neither is open — a closed
 * call must never be offered, the server would reject it.
 */
export const resolveDefaultStatusCall = (calls: readonly CallResultData[], activeCallId: string | null | undefined, current: CurrentDestinationRef | null | undefined): CallResultData | null => {
  if (activeCallId) {
    const active = calls.find((call) => call.CallId === activeCallId);

    if (active) return active;
  }

  const currentCallId = getCurrentStatusCallId(current);

  return currentCallId ? (calls.find((call) => String(call.CallId) === currentCallId) ?? null) : null;
};

/** Transporting and At Hospital: the status meanings that go to a call's assigned destination. */
export const TRANSPORT_BASE_TYPES: readonly number[] = [ActionBaseTypes.Transporting, ActionBaseTypes.AtHospital];

/**
 * Transport destination checks (Core `TransportDestinationRules`; the Unit and Dispatch apps carry the same rules): a status
 * whose base type is Transporting or At Hospital goes to the destination assigned on its call (`DestinationPoiId`).
 */
export const isTransportBaseType = (baseType: number | string | null | undefined): boolean => {
  if (baseType == null || baseType === '') return false;

  const value = Number(baseType);

  return Number.isInteger(value) && TRANSPORT_BASE_TYPES.includes(value);
};

/**
 * The call's assigned destination as a row of the loaded POI list, or null when the call has none or the POI is not
 * offered (not a destination POI, or not loaded): only a POI the user could pick is pre-selected or compared against.
 */
export const resolveAssignedDestinationPoi = (call: Pick<CallResultData, 'DestinationPoiId'> | null | undefined, pois: readonly PoiResultData[]): PoiResultData | null => {
  const id = call?.DestinationPoiId == null ? NaN : Number(call.DestinationPoiId);

  if (!Number.isFinite(id) || id <= 0) return null;

  return pois.find((poi) => Number(poi.PoiId) === id) ?? null;
};

/** What a unit's current status means and points at, for `getCurrentTransportPoiId`. */
export interface CurrentTransportRef {
  baseType?: number | string | null;
  destinationId?: number | string | null;
  destinationType?: number | string | null;
}

/**
 * The POI the unit is already transporting to: its current status is a transport status pointing at a POI. A crew that
 * changed hospital on "Departing" keeps that hospital for "At Hospital", and is not asked for the reason again.
 */
export const getCurrentTransportPoiId = (current: CurrentTransportRef | null | undefined): string | null => {
  if (!current || !isTransportBaseType(current.baseType) || Number(current.destinationType) !== DestinationEntityTypes.Poi) return null;

  const id = Number(current.destinationId);

  return Number.isFinite(id) && id > 0 ? String(id) : null;
};

/** The loaded POI with this id (number or string), or null. */
export const findPoiById = (pois: readonly PoiResultData[], poiId: number | string | null | undefined): PoiResultData | null => {
  if (poiId == null || poiId === '') return null;

  const id = Number(poiId);

  return Number.isFinite(id) && id > 0 ? (pois.find((poi) => Number(poi.PoiId) === id) ?? null) : null;
};

/**
 * True when a deviation needs a reason: the department turned the checks on and the destination is not the one the unit
 * already reported (its reason was given then).
 */
export const isTransportReasonRequired = (checksEnabled: boolean, isDeviation: boolean, destination: StatusDestination, currentTransportPoi: PoiResultData | null): boolean => {
  if (!checksEnabled || !isDeviation) return false;

  return !(currentTransportPoi && destination.type === 'poi' && Number(destination.poi.PoiId) === Number(currentTransportPoi.PoiId));
};

/**
 * True when a transport status goes to a POI other than the call's assigned one. No destination, a call or a station is
 * never a deviation, and neither is anything when no assigned destination resolved.
 */
export const isTransportDestinationDeviation = (baseType: number | string | null | undefined, destination: StatusDestination, assigned: PoiResultData | null): boolean => {
  if (!assigned || !isTransportBaseType(baseType) || destination.type !== 'poi') return false;

  return Number(destination.poi.PoiId) !== Number(assigned.PoiId);
};

export interface EffectiveDestinationInput {
  detail: number;
  lenient: boolean;
  selection: StatusDestination;
  /** True once the user tapped a destination row (including "No destination"): the default is then never re-applied. */
  hasExplicitChoice: boolean;
  defaultCall: CallResultData | null;
  /**
   * A transport status's default: the default call's assigned destination (`resolveAssignedDestinationPoi`), preferred
   * over the call when the status offers POIs. Pass null for any other status.
   */
  defaultPoi?: PoiResultData | null;
}

/**
 * What a submit sends. A status without a destination step still carries the open default call silently (a department
 * whose "On Scene" has no destination still needs it tied to the call); a status with one sends the selection, else the
 * default (a transport status's assigned destination POI, else the call) until the user chose otherwise.
 */
export const resolveEffectiveDestination = ({ detail, lenient, selection, hasExplicitChoice, defaultCall, defaultPoi = null }: EffectiveDestinationInput): StatusDestination => {
  if (detail === 0) return defaultCall ? { type: 'call', call: defaultCall } : NO_DESTINATION;
  const tabs = getDestinationTabs(detail, lenient);

  if (selection.type !== 'none' && tabs.includes(selection.type)) return selection;

  if (!hasExplicitChoice && defaultPoi && tabs.includes('poi')) return { type: 'poi', poi: defaultPoi };

  if (!hasExplicitChoice && tabs.includes('call') && defaultCall) return { type: 'call', call: defaultCall };

  return NO_DESTINATION;
};

/** RespondingTo / RespondingToType for a destination (Station 1, Call 2, POI 3). */
export const toRespondingTo = (destination: StatusDestination): { respondingTo: string; respondingToType: number | null } => {
  switch (destination.type) {
    case 'call':
      return { respondingTo: destination.call.CallId, respondingToType: DestinationEntityTypes.Call };
    case 'station':
      return { respondingTo: destination.station.GroupId, respondingToType: DestinationEntityTypes.Station };
    case 'poi':
      return { respondingTo: String(destination.poi.PoiId), respondingToType: DestinationEntityTypes.Poi };
    default:
      return { respondingTo: '', respondingToType: null };
  }
};

/** The label of a destination row / summary; a call's withheld name shows as `protectedLabel`. */
export const destinationLabel = (destination: StatusDestination, protectedLabel: string): string => {
  switch (destination.type) {
    case 'call': {
      const name = callDisplayName(destination.call, protectedLabel);

      return destination.call.Number ? `#${destination.call.Number} ${name}`.trim() : name;
    }

    case 'station':
      return destination.station.Name;
    case 'poi':
      return destination.poi.Name || destination.poi.Address || destination.poi.PoiTypeName;
    default:
      return '';
  }
};
