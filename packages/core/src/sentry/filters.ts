import type { Breadcrumb, ErrorEvent, StackFrame, TransactionEvent } from '@sentry/react-native';

import { sanitizeUrl, scrubText } from '../logging/sanitize';

// Pure Sentry hooks, kept apart from init so they can be tested without the SDK.

const HTTP_CATEGORIES = new Set(['xhr', 'fetch', 'http', 'navigation']);

/**
 * Responder's breadcrumb policy plus URL scrubbing:
 * - console breadcrumbs are dropped everywhere: in development every log would be synced to the native scope, and
 *   in production a stray `console.log` of an API payload would ride along on every event. The logger already
 *   adds sanitized `log` breadcrumbs for warn/error.
 * - request/navigation URLs lose their query string and hash (tokens travel there).
 * - messages lose control characters (SentryCrash rejects them) and inline credentials.
 */
export function sentryBeforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  const next: Breadcrumb = { ...breadcrumb };
  if (typeof next.message === 'string') next.message = scrubText(next.message);
  if (next.data && HTTP_CATEGORIES.has(next.category ?? '')) {
    const data: Record<string, unknown> = { ...next.data };
    for (const field of ['url', 'from', 'to']) {
      if (typeof data[field] === 'string') data[field] = sanitizeUrl(data[field]);
    }
    next.data = data;
  }
  return next;
}

// Known third-party noise, matched on the exception's type, value and frames.
const MAP_GEOLOCATE_FUNCTIONS = ['_cameraForBounds', 'GeolocateControl', 'fromInvProjectionMatrix'];
const NOISE_MESSAGES = [/^ResizeObserver loop (limit exceeded|completed with undelivered notifications)/];

/**
 * Unit/IC noise filters. The map library's GeolocateControl throws `TypeError: Cannot read properties of null
 * (reading '3')` from fitBounds when the globe projection matrix is not ready (seen with Mapbox GL JS; MapLibre GL
 * shares the code path); browsers report benign ResizeObserver loop warnings as errors.
 */
export function isNoiseEvent(event: ErrorEvent): boolean {
  const values = event.exception?.values;
  if (!values?.length) return false;
  const top = values[values.length - 1];
  const value = top.value ?? '';
  if (NOISE_MESSAGES.some((re) => re.test(value))) return true;
  if (top.type === 'TypeError' && value.includes("Cannot read properties of null (reading '3')")) {
    const frames: StackFrame[] = top.stacktrace?.frames ?? [];
    return frames.some((f) => MAP_GEOLOCATE_FUNCTIONS.some((name) => f.function?.includes(name)));
  }
  return false;
}

/** Drops noise and, on web, tags the user agent (Dispatch). Request bodies and cookies never leave the device. */
export function sentryBeforeSend(event: ErrorEvent, platformOS: string): ErrorEvent | null {
  if (isNoiseEvent(event)) return null;
  const next: ErrorEvent = { ...event };
  if (next.request) {
    const { data: _data, cookies: _cookies, ...request } = next.request;
    next.request = { ...request, url: sanitizeUrl(request.url), query_string: undefined };
  }
  if (platformOS === 'web') {
    next.tags = { ...next.tags, user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown' };
  }
  return next;
}

/**
 * Navigation transactions without a route produce "fallback timestamp" errors (U/I/D). Responder ran this check
 * in beforeSend, where transactions never arrive, so it never applied there.
 */
export function sentryBeforeSendTransaction(event: TransactionEvent): TransactionEvent | null {
  const trace = event.contexts?.trace;
  if (trace?.op === 'navigation' && !trace.data?.route) return null;
  return event;
}
