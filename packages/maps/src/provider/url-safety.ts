import { isDev } from '@resgrid/core';

/**
 * Map resource URLs (styles, tiles, static maps) follow the server URL rule (AGENTS.md): https only, plain http only to
 * localhost in development builds. Anything else is ignored rather than loaded.
 */
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?(\/|$)/i;

export const isSafeMapUrl = (value: string | null | undefined, allowLocalHttp: boolean = isDev()): value is string => {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) {
    return false;
  }
  if (/^https:\/\/[^\s/?#]+/i.test(url)) {
    return true;
  }
  return allowLocalHttp && LOCALHOST.test(url);
};

/** Trimmed string or '' (config fields may be null, undefined or padded). */
export const cleanString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
