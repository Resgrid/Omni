import { ProtectedFieldIds, revealedValue } from '@resgrid/auth';
import type { NavigationTarget } from '@resgrid/features/contacts';
import type { CallResultData } from '@resgrid/models';

import { revealedCallText } from './call-display';

/** A coordinate as Core sends it: text on the call (`Latitude`), a number on its destination (`DestinationLatitude`). */
export type CoordinateValue = string | number | null | undefined;

const toCoordinate = (value: CoordinateValue): number | null => {
  const text = value === null || value === undefined ? '' : String(value).trim();

  if (text === '') return null;
  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : null;
};

/** A usable map point: both parts present, in range, and not the server's (0,0) "no data" sentinel. */
export const isUsablePoint = (latitude: CoordinateValue, longitude: CoordinateValue): boolean => {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);

  if (lat === null || lng === null) return false;

  if (lat === 0 && lng === 0) return false;

  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};

type CallLocationFields = Pick<CallResultData, 'Latitude' | 'Longitude' | 'Address' | 'Name' | 'Geolocation' | 'RedactedFields'> & Partial<Pick<CallResultData, 'CallId'>>;

const geolocationPoint = (geolocation: string | null | undefined): { latitude: number; longitude: number } | null => {
  const [lat, lng] = (geolocation ?? '').split(',');

  return isUsablePoint(lat, lng) ? { latitude: Number(lat), longitude: Number(lng) } : null;
};

const callIdOf = (call: CallLocationFields): { callId: number } | Record<string, never> => {
  const id = Number(call.CallId);

  return Number.isInteger(id) && id > 0 ? { callId: id } : {};
};

/**
 * Where "Directions" / "Route" to a call goes (call detail, Unit call sidebar): the call's coordinates, else its address. Protected
 * (withheld) location values never leave the app in a navigation URL. A point target carries the call id so in-app
 * navigation routes to the call through the server; a withheld location never gets one (the route would reveal it).
 */
export function callLocationTarget(call: CallLocationFields): NavigationTarget | null {
  const label = revealedCallText(call, 'Name') || undefined;
  const geolocationWithheld = revealedValue(call.RedactedFields, ProtectedFieldIds.callGeolocation, call.Geolocation ?? '') === null;

  if (!geolocationWithheld && isUsablePoint(call.Latitude, call.Longitude)) return { latitude: Number(call.Latitude), longitude: Number(call.Longitude), label, ...callIdOf(call) };
  const fromGeolocation = geolocationWithheld ? null : geolocationPoint(call.Geolocation);

  if (fromGeolocation) return { ...fromGeolocation, label, ...callIdOf(call) };
  const address = revealedCallText(call, 'Address')?.trim() ?? '';

  return address !== '' ? { address, label } : null;
}

/**
 * The call's point to rank the nearest-unit board from: its coordinates, else its geolocation; null without one or when
 * the location is withheld from the viewer (a ranking would reveal it).
 */
export function callPoint(call: CallLocationFields | null | undefined): { latitude: number; longitude: number } | null {
  const target = call ? callLocationTarget(call) : null;

  return target && 'latitude' in target ? { latitude: target.latitude, longitude: target.longitude } : null;
}

type CallDestinationFields = Pick<CallResultData, 'DestinationLatitude' | 'DestinationLongitude' | 'DestinationAddress' | 'DestinationName'> & Partial<Pick<CallResultData, 'DestinationGeolocation'>>;

/**
 * Where "Directions" to the call's destination goes: the destination POI (e.g. a hospital) or, Core M0322, the free
 * destination (Core fills `DestinationLatitude/Longitude` and `DestinationAddress` from it when the call has no destination
 * POI; `DestinationGeolocation` is read when the point is missing). Its coordinates, else its address; null when the call
 * has no destination.
 */
export function callDestinationTarget(call: CallDestinationFields): NavigationTarget | null {
  const label = call.DestinationName?.trim() || call.DestinationAddress?.trim() || undefined;

  if (isUsablePoint(call.DestinationLatitude, call.DestinationLongitude)) return { latitude: Number(call.DestinationLatitude), longitude: Number(call.DestinationLongitude), label };
  const freePoint = geolocationPoint(call.DestinationGeolocation);

  if (freePoint) return { ...freePoint, label };
  const address = call.DestinationAddress?.trim() ?? '';

  return address !== '' ? { address, label } : null;
}

type CallDestinationPresenceFields = CallDestinationFields & Pick<CallResultData, 'DestinationPoiId'> & Partial<Pick<CallResultData, 'DestinationWhat3Words'>>;

/** Core M0322: the call has a destination — a destination POI, or a free destination point or address. */
export function callHasDestination(call: CallDestinationPresenceFields): boolean {
  if (call.DestinationPoiId !== null && call.DestinationPoiId !== undefined && call.DestinationPoiId > 0) return true;

  return callDestinationTarget(call) !== null;
}

/** A free destination (Core M0322): a place that is not a POI. */
export interface CallFreeDestination {
  /** The destination point; null when only an address (or what3words) was given. */
  point: { latitude: number; longitude: number } | null;
  address: string;
  what3words: string;
  /** What to show for it: the address, else `///what3words`, else the coordinates. */
  label: string;
}

const formatCoordinate = (value: number): string => String(Math.round(value * 1e5) / 1e5);

/**
 * The call's free destination (Core M0322; read for the call detail and the status destination target): null when the call
 * has a destination POI or no destination. Core returns it in `DestinationAddress` / `DestinationLatitude/Longitude` (with
 * `DestinationName` null) and in `DestinationGeolocation` / `DestinationWhat3Words`.
 */
export function callFreeDestination(call: CallDestinationPresenceFields): CallFreeDestination | null {
  if (call.DestinationPoiId !== null && call.DestinationPoiId !== undefined && call.DestinationPoiId > 0) return null;
  const target = callDestinationTarget(call);
  const point = target && 'latitude' in target ? { latitude: target.latitude, longitude: target.longitude } : null;
  const address = call.DestinationAddress?.trim() ?? '';
  const what3words = call.DestinationWhat3Words?.trim() ?? '';

  if (!point && address === '' && what3words === '') return null;
  const coordinates = point ? `${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}` : '';

  return { point, address, what3words, label: address || (what3words ? `///${what3words}` : '') || coordinates };
}

/**
 * The call's destination in one line (lists and queues): the destination POI's name (else its address), or the free
 * destination's address, `///what3words` or point (Core M0322); empty when the call has none.
 */
export function callDestinationText(call: CallDestinationPresenceFields): string {
  if (call.DestinationPoiId !== null && call.DestinationPoiId !== undefined && call.DestinationPoiId > 0) return call.DestinationName?.trim() || call.DestinationAddress?.trim() || '';

  return callFreeDestination(call)?.label ?? '';
}
