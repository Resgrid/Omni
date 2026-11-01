import { ApiError, toApiError } from './api-error';
import { type EndpointDefinition } from './endpoint';
import { type ResgridRequestConfig } from './http-client';
import { type ApiContext, type RequestArgs, type RequestOptions, resolveEndpointUrl } from './request';
import { joinUrl } from './url';

/** Absolute URL for an endpoint (for image sources and downloads that attach their own auth header). */
export const endpointUrl = (ctx: ApiContext, definition: EndpointDefinition, params?: object): string => joinUrl(ctx.http.getBaseUrl(), resolveEndpointUrl(definition, params));

export interface BinaryResponse {
  data: ArrayBuffer;
  /** MIME type without parameters, lower-cased (`image/png`), or null. */
  contentType: string | null;
}

/** GETs a binary endpoint through the authenticated client. */
export const requestBinary = async (ctx: ApiContext, definition: EndpointDefinition, args: RequestArgs = {}, options: RequestOptions = {}): Promise<BinaryResponse> => {
  const config: ResgridRequestConfig = {
    method: definition.method,
    url: resolveEndpointUrl(definition, args.params),
    responseType: 'arraybuffer',
    signal: options.signal,
    resgrid: { anonymous: definition.anonymous === true },
  };
  if (options.timeoutMs !== undefined) {
    config.timeout = options.timeoutMs;
  }
  try {
    const response = await ctx.http.axios.request<ArrayBuffer>(config);
    const header = response.headers?.['content-type'];
    const contentType = typeof header === 'string' && header ? header.split(';')[0].trim().toLowerCase() : null;
    return { data: response.data, contentType };
  } catch (error) {
    throw toApiError(error);
  }
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 for an ArrayBuffer without `Buffer` or `btoa` (works on Hermes, web and Node). */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let output = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    output += BASE64_ALPHABET[(n >> 18) & 63] + BASE64_ALPHABET[(n >> 12) & 63] + BASE64_ALPHABET[(n >> 6) & 63] + BASE64_ALPHABET[n & 63];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i] << 16;
    output += BASE64_ALPHABET[(n >> 18) & 63] + BASE64_ALPHABET[(n >> 12) & 63] + '==';
  } else if (remaining === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    output += BASE64_ALPHABET[(n >> 18) & 63] + BASE64_ALPHABET[(n >> 12) & 63] + BASE64_ALPHABET[(n >> 6) & 63] + '=';
  }
  return output;
};

export interface ImageDataUriOptions {
  /** Accepted MIME types (default png and jpeg). */
  allowedTypes?: readonly string[];
  /** Maximum size in bytes (default 10 MB). */
  maxBytes?: number;
}

/**
 * Fetches an authenticated image and returns a `data:` URI, refusing other content types and oversized files
 * (Responder's checklist / work-order image rule: never render arbitrary server bytes as an image).
 */
export const fetchImageDataUri = async (ctx: ApiContext, definition: EndpointDefinition, args: RequestArgs = {}, options: RequestOptions & ImageDataUriOptions = {}): Promise<string> => {
  const allowed = options.allowedTypes ?? ['image/png', 'image/jpeg'];
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const { data, contentType } = await requestBinary(ctx, definition, args, options);
  if (!contentType || !allowed.includes(contentType) || data.byteLength > maxBytes) {
    throw new ApiError({ kind: 'unknown', message: 'Unsupported image', method: definition.method, path: definition.path });
  }
  return `data:${contentType};base64,${arrayBufferToBase64(data)}`;
};
