import { type ApiContext, type EndpointDefinition, type ResgridRequestConfig, resolveEndpointUrl, toApiError } from '@resgrid/api';

export interface AuthRequestArgs {
  /** Path and query parameters (names in the path template go to the path, declared names to the query). */
  params?: object;
  body?: unknown;
}

export interface AuthRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Extra headers for this one call (e.g. `X-Resgrid-Operator-Activity`). */
  headers?: Record<string, string>;
}

const encodeForm = (body: unknown): URLSearchParams | undefined => {
  if (body === undefined || body instanceof URLSearchParams) {
    return body;
  }
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }
  return form;
};

/**
 * `@resgrid/api`'s `request()` with per-call headers: the same URL resolution (undeclared parameters are refused), the
 * same anonymous flag, the same `ApiError` conversion (no request body ever rides along on the error).
 */
export const authRequest = async <T>(ctx: ApiContext, definition: EndpointDefinition, args: AuthRequestArgs = {}, options: AuthRequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  let data: unknown = args.body;
  if (definition.body === 'form') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    data = encodeForm(args.body);
  } else if (definition.body === 'json' && data === undefined && definition.method !== 'GET' && definition.method !== 'DELETE') {
    data = {};
  }
  const config: ResgridRequestConfig = {
    method: definition.method,
    url: resolveEndpointUrl(definition, args.params),
    data,
    headers,
    signal: options.signal,
    resgrid: { anonymous: definition.anonymous === true },
  };
  if (options.timeoutMs !== undefined) {
    config.timeout = options.timeoutMs;
  }
  try {
    const response = await ctx.http.axios.request<T>(config);
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
};

/** The v4 wrapper: these results carry their payload in `Data`. */
export interface DataResult<T> {
  Data: T;
}

/** `authRequest` returning the result's `Data`. */
export const authData = async <T>(ctx: ApiContext, definition: EndpointDefinition, args: AuthRequestArgs = {}, options: AuthRequestOptions = {}): Promise<T> =>
  (await authRequest<DataResult<T>>(ctx, definition, args, options)).Data;
