import { type ApiContext, getMapIconLegend, reverseGeocode } from '@resgrid/api';
import type { GetMapIconLegendResultData } from '@resgrid/models';

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
  /** Signs a server-hosted map resource URL (D12). Identity until Core ships signed map URLs. */
  signUrl: (url: string) => string;
}

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
  signUrl: (url) => url,
  ...overrides,
});
