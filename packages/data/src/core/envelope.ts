import { isV4Failure, isV4NotFound, type V4Envelope, V4FailureError } from '@resgrid/api';

/** Any Core v4 result: `Data` plus the string `Status` (`not_found` arrives with HTTP 200). */
export interface Enveloped<T> {
  Data?: T | null;
  Status?: string | null;
}

const fail = (result: unknown): never => {
  throw new V4FailureError(result as V4Envelope);
};

/** `Data` as a list: `not_found` / missing / non-array → `[]`; a `failure` envelope throws `V4FailureError`. */
export function unwrapList<T>(result: Enveloped<T[]> | null | undefined): T[] {
  if (!result) return [];
  if (isV4Failure(result)) fail(result);
  if (isV4NotFound(result)) return [];
  return Array.isArray(result.Data) ? result.Data : [];
}

/** `Data` as a single item: `not_found` / missing → `null`; a `failure` envelope throws `V4FailureError`. */
export function unwrapItem<T>(result: Enveloped<T> | null | undefined): T | null {
  if (!result) return null;
  if (isV4Failure(result)) fail(result);
  if (isV4NotFound(result)) return null;
  return result.Data ?? null;
}

/**
 * The body of a GeoJSON endpoint (`Mapping/GetMapLayerGeoJSON`, `GetIndoorMapZonesGeoJSON`): Core sends the GeoJSON
 * itself, not a v4 envelope, so the body is the payload (parsing it is the map's job). An envelope is still read like
 * any other item: `failure` throws, `not_found` is null, otherwise its `Data`.
 */
export function unwrapGeoJSON<T>(result: Enveloped<T> | null | undefined): T | null {
  if (!result) return null;

  if (isV4Failure(result)) fail(result);

  if (isV4NotFound(result)) return null;

  if ('Data' in result) return result.Data ?? null;

  // SAFETY: no `Data` key and no v4 status means Core answered with the bare GeoJSON (`Content(geoJson, "application/geo+json")`).
  return result as T;
}

/** Throws `V4FailureError` for a `failure` envelope (writes that answer HTTP 200 with a refusal). */
export function assertV4Success<R>(result: R): R {
  if (result && isV4Failure(result)) fail(result);
  return result;
}
