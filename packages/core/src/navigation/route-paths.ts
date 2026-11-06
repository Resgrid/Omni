import type { Href } from 'expo-router';

import { logger } from '../logging/logger';
import { isSafeRouteId } from '../utils/route-ids';

/**
 * An id as a route builder receives it. Its type says string or number, but it came off the wire or out of a push
 * payload, so at run time it can be missing: a server field the app reads under the wrong name (protocols' `ProtocolId`
 * read as `Id`) arrives as undefined.
 */
export type RouteIdInput = string | number | null | undefined;

/** Which ids a route accepts. */
export type RouteIdCheck = (id: RouteIdInput) => boolean;

/** A positive integer id, as a number or as its digits (`12`, `'12'`): calls, POIs and certifications. */
export const isNumericRouteId: RouteIdCheck = (id) => (Number.isSafeInteger(id) && Number(id) > 0) || (isSafeRouteId(id) && /^[1-9]\d*$/.test(id));

/** The default check: an `isSafeRouteId` string, or a positive integer id that arrived as a number. */
const isRouteId: RouteIdCheck = (id) => isSafeRouteId(id) || isNumericRouteId(id);

/** What the report says about a refused id: never the value itself, which may be junk from a push payload. */
const describeRefusedId = (id: RouteIdInput): string => (id === null || id === undefined || id === '' ? 'missing' : 'malformed');

/**
 * `id` URI-encoded for a route path, or null when `accepts` refuses it.
 *
 * Route builders run inside press handlers, where a throw is an uncaught JS error that hard-crashes a release build on
 * Android and iOS (a protocol list whose ids were all undefined did exactly that). So a refused id is reported as an
 * error naming the route (one Sentry issue per route) and costs one dead tap: callers navigate with `pushRoutePath` /
 * `replaceRoutePath`, which skip a null path. `isSafeRouteId` still keeps anything that could steer the router (a path
 * separator, query, fragment, dot segment or control character) out of the path.
 */
export const encodeRouteId = (route: string, id: RouteIdInput, accepts: RouteIdCheck = isRouteId): string | null => {
  if (accepts(id)) return encodeURIComponent(String(id));

  logger.error({ message: `Route id refused for ${route}; navigation skipped`, context: { route, id: describeRefusedId(id) } });

  return null;
};

/** `build(encodedId)`, or null when the id is refused (see `encodeRouteId`). */
export const routePathWithId = (route: string, id: RouteIdInput, build: (encodedId: string) => string, accepts: RouteIdCheck = isRouteId): string | null => {
  const encodedId = encodeRouteId(route, id, accepts);

  return encodedId === null ? null : build(encodedId);
};

/**
 * `path` with `?name=id` for each present query id (null, undefined and '' are left out), or null when `path` is null
 * or a present id is refused (see `encodeRouteId`).
 */
export const routePathWithQuery = (route: string, path: string | null, query: Readonly<Record<string, RouteIdInput>>, accepts: RouteIdCheck = isRouteId): string | null => {
  if (path === null) return null;

  const parts: string[] = [];

  for (const [name, id] of Object.entries(query)) {
    if (id === null || id === undefined || id === '') continue;

    const encodedId = encodeRouteId(route, id, accepts);

    if (encodedId === null) return null;

    parts.push(`${name}=${encodedId}`);
  }

  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
};

/** expo-router's `router`, or the `useRouter()` result a screen already navigates with. */
export interface RoutePushNavigator {
  push: (href: Href) => void;
}

export interface RouteReplaceNavigator {
  replace: (href: Href) => void;
}

/** Pushes a route builder's path. A null path (an id the builder refused and reported) is a no-op, not a crash. */
export const pushRoutePath = (navigator: RoutePushNavigator, path: Href | null): void => {
  if (path !== null) navigator.push(path);
};

/** Replaces the current screen with a route builder's path; a null path is a no-op (see `pushRoutePath`). */
export const replaceRoutePath = (navigator: RouteReplaceNavigator, path: Href | null): void => {
  if (path !== null) navigator.replace(path);
};
