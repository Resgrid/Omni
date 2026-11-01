/**
 * Result codes for offline maps. `@resgrid/maps` never translates: the Offline maps screen maps each code to a
 * `t('offline_maps.error.<code>')` string. Codes never carry URLs, tokens or response bodies.
 */
export type OfflineMapsErrorCode =
  // Availability
  | 'unsupported-platform'
  | 'disabled'
  | 'no-session'
  // Manifest
  | 'manifest-url-missing'
  | 'manifest-url-untrusted'
  | 'manifest-url-expired'
  | 'manifest-http-error'
  | 'manifest-network-error'
  | 'manifest-invalid'
  | 'manifest-not-found'
  // Guards
  | 'pack-too-large'
  | 'response-area-too-large'
  | 'insufficient-storage'
  | 'waiting-for-wifi'
  | 'offline'
  // Items
  | 'unsafe-url'
  | 'missing-hash'
  | 'unsupported-kind'
  // Downloads
  | 'download-http-error'
  | 'download-network-error'
  | 'download-url-expired'
  | 'size-mismatch'
  | 'integrity-failed'
  | 'storage-error'
  | 'cancelled'
  | 'nothing-to-download';

/** Outcome of a manager action, for the UI. */
export type OfflineMapsActionResult = { ok: true } | { ok: false; code: OfflineMapsErrorCode; httpStatus?: number };

export const actionOk: OfflineMapsActionResult = { ok: true };

export const actionFailed = (code: OfflineMapsErrorCode, httpStatus?: number): OfflineMapsActionResult => (httpStatus === undefined ? { ok: false, code } : { ok: false, code, httpStatus });

/** Error class name only (never the message: it may carry a URL). */
export const errorName = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

export const isAbortError = (error: unknown): boolean => error instanceof Error && (error.name === 'AbortError' || error.name === 'CancelledError');
