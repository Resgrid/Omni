import { forwardGeocode, plusCodeLookup, reverseGeocode, what3WordsLookup } from '@resgrid/api';
import { getDataApiContext } from '@resgrid/data';
import type { ForwardGeocodeData } from '@resgrid/models';

/**
 * The call form's location lookups (Dispatch new/edit call), always through the Resgrid server (resgrid-maps: the app
 * never calls a geocoding provider). The server resolves one best match.
 */

export interface GeocodedPlace {
  latitude: number;
  longitude: number;
  address: string;
}

export interface GeocodeLookup {
  /** False when the lookup itself failed — a different message from "no match". */
  succeeded: boolean;
  place: GeocodedPlace | null;
}

const toLookup = (data: ForwardGeocodeData | undefined, typed: string): GeocodeLookup => {
  if (!data) return { succeeded: false, place: null };

  if (data.Latitude === null || data.Latitude === undefined || data.Longitude === null || data.Longitude === undefined) return { succeeded: data.LookupSucceeded === true, place: null };

  return { succeeded: true, place: { latitude: data.Latitude, longitude: data.Longitude, address: data.Address || typed } };
};

/** what3words addresses are three words joined by dots ("filled.count.soap"). */
export const isWhat3WordsFormat = (words: string): boolean => /^[a-z]+\.[a-z]+\.[a-z]+$/.test(words.trim().toLowerCase());

export async function lookupAddress(address: string): Promise<GeocodeLookup> {
  return toLookup((await forwardGeocode(getDataApiContext(), { address: address.trim() })).Data, address.trim());
}

export async function lookupWhat3Words(words: string): Promise<GeocodeLookup> {
  return toLookup((await what3WordsLookup(getDataApiContext(), { words: words.trim() })).Data, words.trim());
}

/** A short plus code needs the locality it was shortened against, so the whole text goes to the server. */
export async function lookupPlusCode(code: string): Promise<GeocodeLookup> {
  return toLookup((await plusCodeLookup(getDataApiContext(), { code: code.trim() })).Data, code.trim());
}

/** The address of a point, or null when there is none (or the lookup failed). */
export async function lookupAddressAt(latitude: number, longitude: number): Promise<string | null> {
  const data = (await reverseGeocode(getDataApiContext(), { lat: latitude, lon: longitude })).Data;

  return data?.Address?.trim() || null;
}
