import type { SignedMapResourceUrl } from '@resgrid/models';

/**
 * Signed URLs for server-hosted map resources (MapLibre plan D12). Native map sources (and maplibre-gl, which this app
 * gives no auth header either) cannot send the bearer token, so custom map tiles/images and indoor floor images load
 * through expiring `d`/`e`/`sig` query signatures from Core's batch endpoint `POST Mapping/SignMapResourceUrls`
 * (`MapResourceUrls.cs`: the signature covers department + resource + expiry, never `{z}/{x}/{y}`, so one signed
 * template serves every tile; lifetime `SignedMapUrlTtlHours`, default 24 h, minimum 1 h).
 *
 * Signed URLs are cached in memory by the unsigned URL and signed again before they expire. A URL that cannot be signed
 * (signing failed, the server refused it, an older server without the endpoint) resolves to null — an unsigned URL is
 * never handed to a map source as if it were signed, so the layer draws nothing instead of a wall of 401s.
 */

/** Core's batch call: the signed URL per URL sent (`SignedUrl` null when the server will not sign it). */
export type SignMapResourceBatch = (urls: string[]) => Promise<readonly SignedMapResourceUrl[]>;

export interface SignedMapUrl {
  /** The signed URL, or null when it could not be signed. */
  url: string | null;
  /** Epoch ms after which the URL is signed again (shortly before the signature expires, or the retry time). */
  refreshAt: number;
}

export interface MapUrlSigner {
  /** Signs one URL (calls made in the same tick share one request); a cached entry is returned while it is fresh. */
  sign(url: string): Promise<SignedMapUrl>;
  /** The cached entry while it is fresh (no request) — lets a remounted layer draw on its first render. */
  peek(url: string): SignedMapUrl | null;
  /** Drops every cached signature (department or server switch). */
  clear(): void;
}

export interface MapUrlSignerOptions {
  now?: () => number;
  /** Most URLs per request (Core signs at most 200). */
  maxBatch?: number;
  /** How long a failed request is remembered before trying again. */
  failureRetryMs?: number;
  /** How long a URL the server refused (`SignedUrl` null) is remembered. */
  refusedRetryMs?: number;
  /** Called (without URLs — they carry signatures) when a request fails. */
  onError?: (error: unknown) => void;
}

const SIGNATURE_PARAMS = new Set(['d', 'e', 'sig']);
/** Lifetime assumed for a signed URL without a readable `e` (Core's minimum). */
const DEFAULT_LIFETIME_MS = 60 * 60 * 1000;
/** Sign again after this share of the remaining lifetime… */
const REFRESH_SHARE = 0.8;
/** …and never later than this before expiry. */
const EXPIRY_MARGIN_MS = 60 * 1000;
const MAX_BATCH = 200;

const splitQuery = (url: string): { base: string; params: string[] } => {
  const hash = url.indexOf('#');
  const withoutHash = hash >= 0 ? url.slice(0, hash) : url;
  const query = withoutHash.indexOf('?');
  if (query < 0) return { base: withoutHash, params: [] };
  return {
    base: withoutHash.slice(0, query),
    params: withoutHash
      .slice(query + 1)
      .split('&')
      .filter((part) => part.length > 0),
  };
};

const paramName = (part: string): string => {
  const equals = part.indexOf('=');
  return decodeURIComponentSafe(equals >= 0 ? part.slice(0, equals) : part);
};

const paramValue = (part: string): string => {
  const equals = part.indexOf('=');
  return equals >= 0 ? decodeURIComponentSafe(part.slice(equals + 1)) : '';
};

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Epoch ms at which the URL's signature expires (`e`, unix seconds), or null when it carries none. */
export const signatureExpiry = (url: string): number | null => {
  const part = splitQuery(url).params.find((candidate) => paramName(candidate) === 'e');
  if (!part) return null;
  const seconds = Number(paramValue(part));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
};

/** True when the URL already carries a map resource signature (`sig` and `e`), e.g. `MercatorTileUrl`. */
export const isSignedMapUrl = (url: string): boolean => {
  const names = splitQuery(url).params.map(paramName);
  return names.includes('sig') && names.includes('e');
};

/** The URL without its `d`/`e`/`sig` signature (other query values kept, `{z}/{x}/{y}` untouched). */
export const stripSignature = (url: string): string => {
  const { base, params } = splitQuery(url);
  const kept = params.filter((part) => !SIGNATURE_PARAMS.has(paramName(part)));
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
};

/** `scheme://host[:port]`, lower-cased ('' when the URL is not absolute). */
const originOf = (url: string): string => {
  const match = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase() : '';
};

/** When a signed URL is signed again: before `REFRESH_SHARE` of its remaining life is used, at least a minute early. */
export const refreshTimeFor = (signedUrl: string, now: number): number => {
  const expiresAt = signatureExpiry(signedUrl) ?? now + DEFAULT_LIFETIME_MS;
  const remaining = expiresAt - now;
  return Math.min(now + remaining * REFRESH_SHARE, expiresAt - EXPIRY_MARGIN_MS);
};

interface Pending {
  resolve: (entry: SignedMapUrl) => void;
}

/**
 * The signer behind `MapServices.urlSigner`. `signBatch` is null without an API context: then only URLs that arrive
 * already signed (and still fresh) resolve; everything else is null.
 */
export function createMapUrlSigner(signBatch: SignMapResourceBatch | null, options: MapUrlSignerOptions = {}): MapUrlSigner {
  const now = options.now ?? Date.now;
  const maxBatch = Math.max(1, Math.min(options.maxBatch ?? MAX_BATCH, MAX_BATCH));
  const failureRetryMs = options.failureRetryMs ?? 2 * 60 * 1000;
  const refusedRetryMs = options.refusedRetryMs ?? 10 * 60 * 1000;
  const cache = new Map<string, SignedMapUrl>();
  const inFlight = new Map<string, Promise<SignedMapUrl>>();
  let queue = new Map<string, Pending[]>();
  let scheduled = false;
  let generation = 0;

  const fresh = (url: string): SignedMapUrl | null => {
    const entry = cache.get(url);
    return entry && now() < entry.refreshAt ? entry : null;
  };

  const settle = (url: string, entry: SignedMapUrl, waiters: readonly Pending[], requestGeneration: number): void => {
    if (requestGeneration === generation) cache.set(url, entry);
    for (const waiter of waiters) waiter.resolve(entry);
  };

  const accept = (unsigned: string, signed: string | null | undefined, at: number): SignedMapUrl => {
    // Only a signed URL on the same origin as the resource (D12: signatures are served on the API origin).
    const value = typeof signed === 'string' ? signed.trim() : '';
    if (!value || originOf(value) === '' || originOf(value) !== originOf(unsigned)) return { url: null, refreshAt: at + refusedRetryMs };
    return { url: value, refreshAt: refreshTimeFor(value, at) };
  };

  const flush = async (): Promise<void> => {
    scheduled = false;
    const batch = queue;
    queue = new Map();
    const requestGeneration = generation;
    const urls = Array.from(batch.keys());
    for (let start = 0; start < urls.length; start += maxBatch) {
      const chunk = urls.slice(start, start + maxBatch);
      try {
        if (!signBatch) throw new Error('No API context for map URL signing');
        const results = await signBatch(chunk);
        const at = now();
        const byUrl = new Map<string, string | null>();
        for (const result of results ?? []) {
          if (result && typeof result.Url === 'string') byUrl.set(result.Url, result.SignedUrl ?? null);
        }
        // Core echoes each URL as sent; one it left out counts as refused.
        for (const url of chunk) settle(url, accept(url, byUrl.get(url), at), batch.get(url) ?? [], requestGeneration);
      } catch (error) {
        if (signBatch) options.onError?.(error);
        const entry: SignedMapUrl = { url: null, refreshAt: now() + failureRetryMs };
        for (const url of chunk) settle(url, entry, batch.get(url) ?? [], requestGeneration);
      }
    }
  };

  const request = (url: string): Promise<SignedMapUrl> => {
    const existing = inFlight.get(url);
    if (existing) return existing;
    const promise = new Promise<SignedMapUrl>((resolve) => {
      const waiters = queue.get(url) ?? [];
      waiters.push({ resolve });
      queue.set(url, waiters);
      if (!scheduled) {
        scheduled = true;
        // Every sign() made in this tick (one render's layers) goes into one request.
        void Promise.resolve().then(flush);
      }
    }).finally(() => inFlight.delete(url));
    inFlight.set(url, promise);
    return promise;
  };

  return {
    sign: async (url) => {
      const key = url.trim();
      if (!key) return { url: null, refreshAt: Number.POSITIVE_INFINITY };
      const cached = fresh(key);
      if (cached) return cached;
      // Already signed by the server (layer results): use it while it is fresh — judged once, when first seen — then
      // sign the bare URL again.
      if (isSignedMapUrl(key)) {
        if (!cache.has(key)) {
          const at = now();
          const entry: SignedMapUrl = { url: key, refreshAt: refreshTimeFor(key, at) };
          if (at < entry.refreshAt) {
            cache.set(key, entry);
            return entry;
          }
        }
        const renewed = await request(stripSignature(key));
        cache.set(key, renewed);
        return renewed;
      }
      return request(key);
    },
    peek: (url) => fresh(url.trim()),
    clear: () => {
      generation += 1;
      cache.clear();
    },
  };
}

/** The department config is fetched again this long before its first signed URL expires. */
export const CONFIG_SIGNATURE_REFRESH_MARGIN_MS = 30 * 60_000;

/**
 * When the department config (`Config/GetConfig`) must be fetched again: Core signs its map URLs (`MapLibreStyleUrlDay`
 * and `Night`, `StaticMapUrlTemplate`, `OfflineManifestUrl`) with the same expiring signature as every map resource
 * (at least an hour), and an app that stays signed in for days outlives it. Returns the earliest expiry less a margin,
 * or null when nothing in the config is signed (older servers).
 */
export const mapConfigRefreshAt = (config: object | null | undefined): number | null => {
  if (!config) return null;
  let earliest: number | null = null;
  for (const value of Object.values(config)) {
    if (typeof value !== 'string' || !isSignedMapUrl(value)) continue;
    const expiry = signatureExpiry(value);
    if (expiry !== null && (earliest === null || expiry < earliest)) earliest = expiry;
  }
  return earliest === null ? null : earliest - CONFIG_SIGNATURE_REFRESH_MARGIN_MS;
};
