import type { ForwardGeocodeResult, ReverseGeocodeResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for geocoding (Geocoding). The contract test checks every entry against Swagger. */
export const geocodingEndpoints = defineEndpoints('geocoding', {
  forwardGeocode: { method: 'GET', path: '/Geocoding/ForwardGeocode', query: ['address'] },
  plusCodeLookup: { method: 'GET', path: '/Geocoding/PlusCodeLookup', query: ['code'] },
  reverseGeocode: { method: 'GET', path: '/Geocoding/ReverseGeocode', query: ['lat', 'lon'] },
  what3WordsLookup: { method: 'GET', path: '/Geocoding/What3WordsLookup', query: ['words'] },
});

const E = geocodingEndpoints;

/** Converts a human-readable address string into geographic coordinates. `GET /Geocoding/ForwardGeocode` — legacy: D. */
export const forwardGeocode = (ctx: ApiContext, params: { address?: string } = {}, options?: RequestOptions): Promise<ForwardGeocodeResult> => request<ForwardGeocodeResult>(ctx, E.forwardGeocode, { params }, options);

/** Converts an Open Location Code (plus code) into geographic coordinates. Full codes resolve on their own; a short code ("8FW4+Q3 Zottegem") needs the locality it was shortened against, so the caller passes the whole string through. `GET /Geocoding/PlusCodeLookup` — legacy: D. */
export const plusCodeLookup = (ctx: ApiContext, params: { code?: string } = {}, options?: RequestOptions): Promise<ForwardGeocodeResult> => request<ForwardGeocodeResult>(ctx, E.plusCodeLookup, { params }, options);

/** Converts geographic coordinates into a human-readable address string. `GET /Geocoding/ReverseGeocode` — legacy: D. */
export const reverseGeocode = (ctx: ApiContext, params: { lat?: number | string; lon?: number | string } = {}, options?: RequestOptions): Promise<ReverseGeocodeResult> =>
  request<ReverseGeocodeResult>(ctx, E.reverseGeocode, { params }, options);

/** Converts a what3words address ("filled.count.soap") into geographic coordinates. Proxied server-side: the what3words API rejects browser origins, so the Dispatch and BigBoard web builds cannot call it directly. `GET /Geocoding/What3WordsLookup` — legacy: D. */
export const what3WordsLookup = (ctx: ApiContext, params: { words?: string } = {}, options?: RequestOptions): Promise<ForwardGeocodeResult> => request<ForwardGeocodeResult>(ctx, E.what3WordsLookup, { params }, options);
