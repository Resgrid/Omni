import type { Href } from 'expo-router';
import { useSyncExternalStore } from 'react';

import { CANONICAL_ROUTES, ROUTE_KEYS, type RouteKey, type RouteParamNames } from './canonical';
import { defineRoutes, type RouteContract } from './define-routes';

export type RouteParamValue = string | number;
export type RouteQuery = Record<string, string | number | boolean | null | undefined>;

type PositionalArgs<A extends readonly string[]> = { -readonly [I in keyof A]: RouteParamValue };

/** `href.callDetail(id)`: the href, or null when this variant has no such screen (hide the link). */
export type HrefBuilder<K extends RouteKey> = (...params: PositionalArgs<RouteParamNames<K>>) => Href | null;

export type HrefBuilders = { readonly [K in RouteKey]: HrefBuilder<K> } & {
  /** Named-parameter form with an optional query string; null when the route is absent or a parameter is missing. */
  readonly build: <K extends RouteKey>(key: K, params?: Partial<Record<RouteParamNames<K>[number], RouteParamValue>>, query?: RouteQuery) => Href | null;
  readonly has: (key: RouteKey) => boolean;
};

const encodeSegment = (value: RouteParamValue): string => encodeURIComponent(String(value));

const toQueryString = (query: RouteQuery | undefined): string => {
  if (!query) {
    return '';
  }
  const parts: string[] = [];
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};

/** Fills a canonical pattern; null when a parameter is missing or empty. */
export function buildRoutePath(key: RouteKey, params: Partial<Record<string, RouteParamValue>> = {}, query?: RouteQuery): string | null {
  const spec = CANONICAL_ROUTES[key];
  let missing = false;
  const path = spec.pattern.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || String(value) === '') {
      missing = true;
      return '';
    }
    return encodeSegment(value);
  });
  return missing ? null : `${path}${toQueryString(query)}`;
}

/** Typed href builders for a route contract. Builders for routes the variant lacks return null. */
export function createHrefBuilders(contract: RouteContract): HrefBuilders {
  const builders: Record<string, unknown> = {};
  for (const key of ROUTE_KEYS) {
    const names = CANONICAL_ROUTES[key].params as readonly string[];
    builders[key] = (...values: RouteParamValue[]): Href | null => {
      if (!contract.has(key)) {
        return null;
      }
      const params: Record<string, RouteParamValue> = {};
      names.forEach((name, index) => {
        const value = values[index];
        if (value !== undefined) {
          params[name] = value;
        }
      });
      const path = buildRoutePath(key, params);
      // The contract test guarantees the variant has a file for every declared route, so the string is a real href.
      return path === null ? null : (path as Href);
    };
  }
  builders.build = (key: RouteKey, params?: Partial<Record<string, RouteParamValue>>, query?: RouteQuery): Href | null => {
    if (!contract.has(key)) {
      return null;
    }
    const path = buildRoutePath(key, params ?? {}, query);
    return path === null ? null : (path as Href);
  };
  builders.has = (key: RouteKey) => contract.has(key);
  return Object.freeze(builders) as HrefBuilders;
}

// ---------------------------------------------------------------------------------------------------------------
// The active variant's contract (set once by configureAppShell from variants/<v>/nav.ts).

let activeContract: RouteContract = defineRoutes(['home']);
let activeBuilders: HrefBuilders = createHrefBuilders(activeContract);
const listeners = new Set<() => void>();

export function setRouteContract(contract: RouteContract): void {
  activeContract = contract;
  activeBuilders = createHrefBuilders(contract);
  listeners.forEach((listener) => listener());
}

export function getRouteContract(): RouteContract {
  return activeContract;
}

/** Href builders outside React (services, notification routing). */
export function getHrefBuilders(): HrefBuilders {
  return activeBuilders;
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Typed href builders for the active variant: `const href = useHref(); const link = href.callDetail(call.CallId);`
 * — render the link only when `link` is not null.
 */
export function useHref(): HrefBuilders {
  return useSyncExternalStore(subscribe, getHrefBuilders, getHrefBuilders);
}
