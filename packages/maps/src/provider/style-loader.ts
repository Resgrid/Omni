import type { StyleSpecification } from '../types';
import { transformMapboxStyle } from './mapbox-compat';

/** Minimal `fetch` shape (injectable for tests and for platforms that wrap fetch). */
export type MapFetch = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface MapboxStyleRequest {
  styleUrl: string;
  fetchUrl: string;
  token: string;
  attribution: string;
}

/**
 * In-memory cache of transformed Mapbox styles, keyed by the fetch URL (style + token), so theme flips and remounts do
 * not refetch. A failed load is evicted so the next attempt retries. Memory only: the URL carries the token.
 */
const cache = new Map<string, Promise<StyleSpecification>>();

export const loadMapboxStyle = (request: MapboxStyleRequest, fetchImpl: MapFetch): Promise<StyleSpecification> => {
  const cached = cache.get(request.fetchUrl);
  if (cached) {
    return cached;
  }
  const pending = (async () => {
    const response = await fetchImpl(request.fetchUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Mapbox style request failed with HTTP ${response.status}`);
    }
    return transformMapboxStyle(await response.json(), request.token, request.attribution);
  })();
  cache.set(request.fetchUrl, pending);
  pending.catch(() => {
    if (cache.get(request.fetchUrl) === pending) {
      cache.delete(request.fetchUrl);
    }
  });
  return pending;
};

/** Drop every cached style (server switch, logout). */
export const clearMapStyleCache = (): void => cache.clear();

export const defaultMapFetch: MapFetch = (url, init) => fetch(url, init);
