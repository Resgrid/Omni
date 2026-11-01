/**
 * Status destinations (Unit `lib/status-destination` + Responder `lib/status-destinations`): which destination kinds a
 * status offers, the call a status defaults to, and the RespondingTo/RespondingToType a selection sends. A status links
 * to a call only through its destination, so the summary line and the submit both read `resolveEffectiveDestination`.
 */
import { type CallResultData, DestinationEntityTypes, type GroupResultData, type PoiResultData, statusDetailAllowsCalls, statusDetailAllowsPois, statusDetailAllowsStations } from '@resgrid/models';

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

export interface EffectiveDestinationInput {
  detail: number;
  lenient: boolean;
  selection: StatusDestination;
  /** True once the user tapped a destination row (including "No destination"): the default is then never re-applied. */
  hasExplicitChoice: boolean;
  defaultCall: CallResultData | null;
}

/**
 * What a submit sends. A status without a destination step still carries the open default call silently (a department
 * whose "On Scene" has no destination still needs it tied to the call); a status with one sends the selection, else
 * the default call until the user chose otherwise.
 */
export const resolveEffectiveDestination = ({ detail, lenient, selection, hasExplicitChoice, defaultCall }: EffectiveDestinationInput): StatusDestination => {
  if (detail === 0) return defaultCall ? { type: 'call', call: defaultCall } : NO_DESTINATION;
  const tabs = getDestinationTabs(detail, lenient);
  if (selection.type !== 'none' && tabs.includes(selection.type)) return selection;
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

/** The label of a destination row / summary. */
export const destinationLabel = (destination: StatusDestination): string => {
  switch (destination.type) {
    case 'call':
      return destination.call.Number ? `#${destination.call.Number} ${destination.call.Name}`.trim() : destination.call.Name;
    case 'station':
      return destination.station.Name;
    case 'poi':
      return destination.poi.Name || destination.poi.Address || destination.poi.PoiTypeName;
    default:
      return '';
  }
};
