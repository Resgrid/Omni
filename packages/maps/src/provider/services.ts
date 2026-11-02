import { type ApiContext, getMapIconLegend, reverseGeocode, signMapResourceUrls } from '@resgrid/api';
import { logger } from '@resgrid/core';
import type { GetMapIconLegendResultData } from '@resgrid/models';

import { createMapUrlSigner, type MapUrlSigner } from './url-signer';

/**
 * What the map components need from the rest of the app, injected through `MapProvider` so `@resgrid/maps` never
 * imports stores, auth or location services. Defaults come from the `apiContext` when one is passed.
 */

export interface MapCurrentPosition {
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracy?: number | null;
}

export interface MapServices {
  /** Device position for pickers ("Get my location"); the app wires `@resgrid/location`. Null = unavailable/denied. */
  getCurrentPosition: () => Promise<MapCurrentPosition | null>;
  /** Address for a coordinate through the server (`Geocoding/ReverseGeocode`) — never a provider called from the app. */
  reverseGeocode: (latitude: number, longitude: number, signal?: AbortSignal) => Promise<string | null>;
  /** `Mapping/GetMapIconLegend`. */
  loadMapIconLegend: (signal?: AbortSignal) => Promise<GetMapIconLegendResultData | null>;
  /** Resgrid v4 API base URL for tile/image URL builders ('' when unknown). */
  getApiBaseUrl: () => string;
  /**
   * Signed URLs for server-hosted map resources (D12) through `Mapping/SignMapResourceUrls`, cached and renewed before
   * they expire. Components read them with `useSignedMapUrl(s)`; a URL that cannot be signed comes back null.
   */
  urlSigner: MapUrlSigner;
}

/** Core's batch signer for an API context; a non-success envelope counts as a failure. */
const signerFor = (apiContext: ApiContext | null | undefined): MapUrlSigner =>
  createMapUrlSigner(
    apiContext
      ? async (urls) => {
          const result = await signMapResourceUrls(apiContext, { Urls: urls });
          if (result?.Status && result.Status !== 'success') throw new Error(`SignMapResourceUrls returned ${result.Status}`);
          return Array.isArray(result?.Data) ? result.Data : [];
        }
      : null,
    // The URLs carry signatures: log the reason only.
    { onError: (error) => logger.warn({ message: 'Could not sign map resource URLs', context: { reason: error instanceof Error ? error.message : 'unknown' } }) }
  );

export const createMapServices = (apiContext: ApiContext | null | undefined, overrides: Partial<MapServices> = {}): MapServices => ({
  getCurrentPosition: async () => null,
  reverseGeocode: async (latitude, longitude, signal) => {
    if (!apiContext) {
      return null;
    }
    const result = await reverseGeocode(apiContext, { lat: latitude, lon: longitude }, { signal });
    const address = result?.Data?.Address?.trim();
    return address ? address : null;
  },
  loadMapIconLegend: async (signal) => {
    if (!apiContext) {
      return null;
    }
    const result = await getMapIconLegend(apiContext, { signal });
    return result?.Data ?? null;
  },
  getApiBaseUrl: () => (apiContext ? apiContext.http.getBaseUrl() : ''),
  urlSigner: overrides.urlSigner ?? signerFor(apiContext),
  ...overrides,
});
