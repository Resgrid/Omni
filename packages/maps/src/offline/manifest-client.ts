import { isSameOrigin } from '@resgrid/api';

import { cleanString, isSafeMapUrl } from '../provider/url-safety';
import { type OfflineMapsErrorCode } from './errors';
import { type OfflineManifest, parseOfflineManifest } from './manifest';
import type { OfflineFetch } from './transport';

/** The `GetConfigResultData` fields offline maps read (MapLibre plan §5.4; all additive, absent on older servers). */
export interface OfflineMapsConfigInput {
  OfflineMapsAvailable?: boolean | null;
  /** Signed URL of `Mapping/GetOfflineManifest`. */
  OfflineManifestUrl?: string | null;
  AmbientCacheMaxBytes?: number | null;
}

/** `available`: the department offers packs; `disabled`: not offered (or an older server); `unsupported`: web/Electron. */
export type OfflineMapsAvailability = 'available' | 'disabled' | 'unsupported';

/** Offline packs need `OfflineMapsAvailable === true` and a manifest URL; anything else keeps the feature off. */
export const resolveOfflineMapsAvailability = (config: OfflineMapsConfigInput | null | undefined, platformSupported: boolean): OfflineMapsAvailability => {
  if (!platformSupported) {
    return 'unsupported';
  }
  return config?.OfflineMapsAvailable === true && cleanString(config.OfflineManifestUrl) ? 'available' : 'disabled';
};

export type ManifestFetchResult = { ok: true; manifest: OfflineManifest } | { ok: false; code: OfflineMapsErrorCode; httpStatus?: number };

export interface FetchOfflineManifestOptions {
  config: OfflineMapsConfigInput | null | undefined;
  /** The Resgrid API base URL; the manifest must come from the same origin (through the Resgrid server only). */
  apiBaseUrl: string;
  fetchImpl: OfflineFetch;
  signal?: AbortSignal;
  allowLocalHttp?: boolean;
}

/**
 * Fetches and parses the department manifest from the signed `OfflineManifestUrl`. The URL must be https and on the
 * Resgrid API's origin; it is never logged (it is signed). Results are codes only.
 */
export async function fetchOfflineManifest({ config, apiBaseUrl, fetchImpl, signal, allowLocalHttp }: FetchOfflineManifestOptions): Promise<ManifestFetchResult> {
  if (config?.OfflineMapsAvailable !== true) {
    return { ok: false, code: 'disabled' };
  }
  const url = cleanString(config.OfflineManifestUrl);
  if (!url) {
    return { ok: false, code: 'manifest-url-missing' };
  }
  const base = cleanString(apiBaseUrl);
  if (!isSafeMapUrl(url, allowLocalHttp) || !base || !isSameOrigin(url, base)) {
    return { ok: false, code: 'manifest-url-untrusted' };
  }

  let response: Awaited<ReturnType<OfflineFetch>>;
  try {
    response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
  } catch {
    return { ok: false, code: 'manifest-network-error' };
  }
  if (response.status === 401 || response.status === 403 || response.status === 410) {
    return { ok: false, code: 'manifest-url-expired', httpStatus: response.status };
  }
  if (response.status === 404) {
    return { ok: false, code: 'manifest-not-found', httpStatus: response.status };
  }
  if (!response.ok) {
    return { ok: false, code: 'manifest-http-error', httpStatus: response.status };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: 'manifest-invalid' };
  }
  const parsed = parseOfflineManifest(body, { allowLocalHttp });
  return parsed.ok ? { ok: true, manifest: parsed.manifest } : { ok: false, code: parsed.code };
}
