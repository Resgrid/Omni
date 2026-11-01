export type QueryPrimitive = string | number | boolean | Date;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | null | undefined;
export type QueryParams = Record<string, QueryValue>;
export type PathParamValue = string | number;

const serialize = (value: QueryPrimitive): string => (value instanceof Date ? value.toISOString() : String(value));

/**
 * Builds a query string (`?a=1&b=x%20y`) from params: `undefined`/`null` are skipped, arrays repeat the key
 * (ASP.NET binds `ids=1&ids=2` to a list), dates become ISO-8601 UTC, everything is encoded exactly once.
 */
export const buildQuery = (params?: QueryParams): string => {
  if (!params) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value as readonly QueryPrimitive[]) {
        if (item !== undefined && item !== null) {
          search.append(key, serialize(item));
        }
      }
      continue;
    }
    search.append(key, serialize(value as QueryPrimitive));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Substitutes `{name}` path parameters (URI-encoded). Throws when one is missing or empty. */
export const buildPath = (template: string, params?: Record<string, PathParamValue | null | undefined>): string =>
  template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(String(value));
  });

/** Joins an API base (`https://host/api/v4`) and a path (`/Calls/GetCall`) with exactly one slash. */
export const joinUrl = (base: string, path: string): string => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

/** Host part of a URL (lower-cased, with port), or null when it is not absolute. */
export const hostOf = (url: string): string | null => {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
};

/** True when `url` points at the same scheme + host as `base` — use before attaching a token to a URL. */
export const isSameOrigin = (url: string, base: string): boolean => {
  const scheme = (value: string) => /^([a-z][a-z0-9+.-]*):/i.exec(value.trim())?.[1].toLowerCase() ?? null;
  const host = hostOf(url);
  return host !== null && host === hostOf(base) && scheme(url) === scheme(base);
};
