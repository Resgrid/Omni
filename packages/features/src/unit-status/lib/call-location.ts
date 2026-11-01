import { ProtectedFieldIds, revealedValue } from '@resgrid/auth';
import type { NavigationTarget } from '@resgrid/features/contacts';
import type { CallResultData } from '@resgrid/models';

const toCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** A usable map point: both parts present, in range, and not the server's (0,0) "no data" sentinel. */
export const isUsablePoint = (latitude: unknown, longitude: unknown): boolean => {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);
  if (lat === null || lng === null) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};

type CallLocationFields = Pick<CallResultData, 'Latitude' | 'Longitude' | 'Address' | 'Name' | 'Geolocation' | 'RedactedFields'>;

const geolocationPoint = (geolocation: string | null | undefined): { latitude: number; longitude: number } | null => {
  const [lat, lng] = (geolocation ?? '').split(',');
  return isUsablePoint(lat, lng) ? { latitude: Number(lat), longitude: Number(lng) } : null;
};

/**
 * Where "Directions" on the active call goes (Unit call sidebar): the call's coordinates, else its address. Protected
 * (withheld) location values never leave the app in a navigation URL.
 */
export function callLocationTarget(call: CallLocationFields): NavigationTarget | null {
  const label = revealedValue(call.RedactedFields, ProtectedFieldIds.callName, call.Name) ?? undefined;
  const geolocationWithheld = revealedValue(call.RedactedFields, ProtectedFieldIds.callGeolocation, call.Geolocation ?? '') === null;
  if (!geolocationWithheld && isUsablePoint(call.Latitude, call.Longitude)) return { latitude: Number(call.Latitude), longitude: Number(call.Longitude), label };
  const fromGeolocation = geolocationWithheld ? null : geolocationPoint(call.Geolocation);
  if (fromGeolocation) return { ...fromGeolocation, label };
  const address = revealedValue(call.RedactedFields, ProtectedFieldIds.callAddress, call.Address)?.trim() ?? '';
  return address !== '' ? { address, label } : null;
}

type CallDestinationFields = Pick<CallResultData, 'DestinationLatitude' | 'DestinationLongitude' | 'DestinationAddress' | 'DestinationName'>;

/** The call's destination POI (e.g. a hospital): its coordinates, else its address; null when the call has none. */
export function callDestinationTarget(call: CallDestinationFields): NavigationTarget | null {
  const label = call.DestinationName?.trim() || call.DestinationAddress?.trim() || undefined;
  if (isUsablePoint(call.DestinationLatitude, call.DestinationLongitude)) return { latitude: Number(call.DestinationLatitude), longitude: Number(call.DestinationLongitude), label };
  const address = call.DestinationAddress?.trim() ?? '';
  return address !== '' ? { address, label } : null;
}
