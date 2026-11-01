import { isRetryableError, toApiError } from './api-error';
import { type ApiCache, type CacheParams } from './cache';
import { type EndpointDefinition, pathParamsOf } from './endpoint';
import { type HttpClient, type ResgridRequestConfig } from './http-client';
import { buildPath, buildQuery, type PathParamValue, type QueryParams, type QueryValue } from './url';

/** Per-variant cache policy (omni-plan §5.5: IC caches 1–2 days, the other apps 15 min–6 h). */
export interface ApiCachePolicy {
  /** Final TTL for an endpoint; receives the package default. */
  ttlMs?: (path: string, defaultTtlMs: number) => number;
  /** Return false to bypass the cache for an endpoint. */
  enabled?: (path: string) => boolean;
  /** Serve the last cached value when the network fails (default true). */
  staleOnError?: boolean;
}

/** What every endpoint function receives first: the HTTP client plus the optional cache. */
export interface ApiContext {
  readonly http: HttpClient;
  readonly cache?: ApiCache;
  readonly cachePolicy?: ApiCachePolicy;
}

export const createApiContext = (context: ApiContext): ApiContext => Object.freeze({ ...context });

export interface RequestOptions {
  signal?: AbortSignal;
  /** Overrides the client timeout for this call (e.g. uploads). */
  timeoutMs?: number;
}

export interface CachedRequestOptions extends RequestOptions {
  /** Skip the cached copy and refresh from the server (pull-to-refresh, retries, SignalR pings). */
  forceRefresh?: boolean;
}

export type CacheSource = 'network' | 'cache' | 'stale';

export interface CachedResult<T> {
  data: T;
  source: CacheSource;
}

export interface RequestArgs {
  /** Path and query parameters together; names in the path template go to the path, the rest to the query. */
  params?: object;
  body?: unknown;
}

const splitParams = (definition: EndpointDefinition, params?: object): { path: Record<string, PathParamValue>; query: QueryParams } => {
  const pathNames = new Set(pathParamsOf(definition.path));
  const allowed = new Set(definition.query ?? []);
  const path: Record<string, PathParamValue> = {};
  const query: QueryParams = {};
  for (const [key, value] of Object.entries((params ?? {}) as Record<string, unknown>)) {
    if (pathNames.has(key)) {
      path[key] = value as PathParamValue;
    } else if (allowed.has(key)) {
      query[key] = value as QueryValue;
    } else if (value !== undefined) {
      throw new Error(`Parameter "${key}" is not declared for ${definition.name} (${definition.method} ${definition.path})`);
    }
  }
  return { path, query };
};

const encodeBody = (definition: EndpointDefinition, body: unknown): unknown => {
  if (body === undefined) {
    return definition.method === 'GET' || definition.method === 'DELETE' ? undefined : definition.body === 'json' ? {} : undefined;
  }
  if (definition.body === 'form' && !(body instanceof URLSearchParams)) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    }
    return form;
  }
  return body;
};

/** Resolved relative URL (`/Mapping/GetPoi/5?x=1`) for a definition and params. */
export const resolveEndpointUrl = (definition: EndpointDefinition, params?: object): string => {
  const { path, query } = splitParams(definition, params);
  return buildPath(definition.path, path) + buildQuery(query);
};

/**
 * Sends one request for an endpoint definition and returns the response body. Throws `ApiError` (HTTP, network,
 * timeout, canceled, no session). A v4 `not_found` is a normal 200 response — check it with `isV4NotFound`.
 */
export const request = async <T>(ctx: ApiContext, definition: EndpointDefinition, args: RequestArgs = {}, options: RequestOptions = {}): Promise<T> => {
  const url = resolveEndpointUrl(definition, args.params);
  const config: ResgridRequestConfig = {
    method: definition.method,
    url,
    data: encodeBody(definition, args.body),
    signal: options.signal,
    resgrid: { anonymous: definition.anonymous === true },
  };
  if (options.timeoutMs !== undefined) {
    config.timeout = options.timeoutMs;
  }
  if (definition.body === 'form') {
    config.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  } else if (definition.body === 'multipart') {
    // React Native adds the boundary to an explicit multipart type; axios drops the header in browsers so they add theirs.
    config.headers = { 'Content-Type': 'multipart/form-data' };
  }
  if (definition.responseType && definition.responseType !== 'json') {
    config.responseType = definition.responseType;
  }
  try {
    const response = await ctx.http.axios.request<T>(config);
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
};

/**
 * True when a v4 payload carries no rows. Core answers an empty list with HTTP 200 and `{ Data: [], Status: 'not_found' }`,
 * so a permissions blip looks identical to a real answer; caching it would hide every row for the whole TTL. Empty
 * answers are cheap to re-fetch, so they are never kept.
 */
export const isEmptyPayload = (payload: unknown): boolean => {
  if (payload === null || payload === undefined) {
    return true;
  }
  if (typeof payload !== 'object') {
    return false;
  }
  if (Array.isArray(payload)) {
    return payload.length === 0;
  }
  const body = payload as { Data?: unknown; Status?: unknown };
  if (typeof body.Status === 'string' && body.Status.toLowerCase().replace(/\s+/g, '_') === 'not_found') {
    return true;
  }
  if (!('Data' in body)) {
    return false;
  }
  if (body.Data === null || body.Data === undefined) {
    return true;
  }
  return Array.isArray(body.Data) && body.Data.length === 0;
};

export interface FetchWithCacheArgs<T> {
  cache: ApiCache | undefined;
  /** Cache key path (resolved, without query). */
  key: string;
  params?: CacheParams;
  ttlMs: number;
  enabled?: boolean;
  staleOnError?: boolean;
  forceRefresh?: boolean;
  fetcher: () => Promise<T>;
}

/**
 * Cached-endpoint semantics (Unit's cached client + IC's offline fallback, omni-plan §7.2):
 * fresh hit → cache; otherwise fetch; a response is only stored when the cache scope (server + identity) did not
 * change while it was in flight; empty / `not_found` payloads evict instead of being stored; when the fetch fails for a
 * retryable reason (offline, timeout, 5xx) the last stored value is served as `stale`.
 */
export const fetchWithCache = async <T>({ cache, key, params, ttlMs, enabled = true, staleOnError = true, forceRefresh = false, fetcher }: FetchWithCacheArgs<T>): Promise<CachedResult<T>> => {
  if (!cache || !enabled) {
    return { data: await fetcher(), source: 'network' };
  }
  if (!forceRefresh) {
    const cached = await cache.get<T>(key, params);
    if (cached !== null) {
      return { data: cached, source: 'cache' };
    }
  }

  const scopeAtRequest = cache.getScopeIdentity();
  let data: T;
  try {
    data = await fetcher();
  } catch (error) {
    if (staleOnError && isRetryableError(error) && cache.getScopeIdentity() === scopeAtRequest) {
      const stale = await cache.getStale<T>(key, params);
      if (stale !== null) {
        return { data: stale, source: 'stale' };
      }
    }
    throw error;
  }

  if (cache.getScopeIdentity() !== scopeAtRequest) {
    // Hand the answer to the caller that asked, but leave the new identity's cache untouched.
    return { data, source: 'network' };
  }
  if (isEmptyPayload(data)) {
    await cache.remove(key, params);
  } else {
    await cache.set(key, data, params, ttlMs);
  }
  return { data, source: 'network' };
};

const cacheKeyParts = (definition: EndpointDefinition, params?: object): { key: string; query?: CacheParams } => {
  const { path, query } = splitParams(definition, params);
  const key = buildPath(definition.path, path);
  const hasQuery = Object.values(query).some((value) => value !== undefined && value !== null);
  return { key, query: hasQuery ? (query as CacheParams) : undefined };
};

/** Cached GET for a definition with `cacheTtlMs`, returning data plus where it came from. */
export const cachedRequestWithSource = <T>(ctx: ApiContext, definition: EndpointDefinition, args: RequestArgs = {}, options: CachedRequestOptions = {}): Promise<CachedResult<T>> => {
  const { key, query } = cacheKeyParts(definition, args.params);
  const defaultTtl = definition.cacheTtlMs ?? 5 * 60 * 1000;
  return fetchWithCache<T>({
    cache: ctx.cache,
    key,
    params: query,
    ttlMs: ctx.cachePolicy?.ttlMs ? ctx.cachePolicy.ttlMs(definition.path, defaultTtl) : defaultTtl,
    enabled: ctx.cachePolicy?.enabled ? ctx.cachePolicy.enabled(definition.path) : true,
    staleOnError: ctx.cachePolicy?.staleOnError ?? true,
    forceRefresh: options.forceRefresh,
    fetcher: () => request<T>(ctx, definition, args, options),
  });
};

/** Cached GET returning only the data (see {@link cachedRequestWithSource}). */
export const cachedRequest = async <T>(ctx: ApiContext, definition: EndpointDefinition, args: RequestArgs = {}, options: CachedRequestOptions = {}): Promise<T> =>
  (await cachedRequestWithSource<T>(ctx, definition, args, options)).data;

/** Drops cached entries for an endpoint (all param combinations, or one when params are given) after a write. */
export const invalidateEndpoint = async (ctx: ApiContext, definition: EndpointDefinition, params?: object): Promise<void> => {
  if (!ctx.cache) {
    return;
  }
  if (params) {
    const { key, query } = cacheKeyParts(definition, params);
    await ctx.cache.remove(key, query);
    return;
  }
  if (pathParamsOf(definition.path).length === 0) {
    await ctx.cache.removeEndpoint(definition.path);
  }
};

export interface CachedEndpointConfig {
  definition: EndpointDefinition;
  /** Overrides the definition's TTL. */
  ttlMs?: number;
  enabled?: boolean;
  staleOnError?: boolean;
}

export interface CachedEndpoint<T> {
  get(params?: object, options?: CachedRequestOptions): Promise<CachedResult<T>>;
  invalidate(params?: object): Promise<void>;
}

/** A reusable cached GET bound to a context (for stores that want `source` and explicit invalidation). */
export const createCachedEndpoint = <T>(ctx: ApiContext, config: CachedEndpointConfig): CachedEndpoint<T> => {
  const definition: EndpointDefinition = config.ttlMs !== undefined ? { ...config.definition, cacheTtlMs: config.ttlMs } : config.definition;
  const scoped: ApiContext =
    config.enabled === undefined && config.staleOnError === undefined
      ? ctx
      : {
          ...ctx,
          cachePolicy: { ...ctx.cachePolicy, enabled: config.enabled === undefined ? ctx.cachePolicy?.enabled : () => config.enabled === true, staleOnError: config.staleOnError ?? ctx.cachePolicy?.staleOnError },
        };
  return {
    get: (params, options) => cachedRequestWithSource<T>(scoped, definition, { params }, options),
    invalidate: (params) => invalidateEndpoint(ctx, definition, params),
  };
};
