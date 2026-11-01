import { CANONICAL_ROUTES, isRouteKey, type RouteKey } from './canonical';

/** Which canonical routes a variant has. Built once per variant with `defineRoutes()` (in `variants/<v>/nav.ts`). */
export interface RouteContract {
  readonly keys: readonly RouteKey[];
  has(key: RouteKey): boolean;
  /** The declared route a concrete path (`/call/12`) or pattern (`/call/[id]`) resolves to, or null. */
  resolve(path: string): RouteKey | null;
}

const splitPath = (path: string): string[] => {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  return withoutQuery.split('/').filter((segment) => segment.length > 0);
};

const isCatchAll = (segment: string): boolean => /^\[\.\.\.[^\]]+\]$/.test(segment);
const isDynamic = (segment: string): boolean => /^\[[^\]]+\]$/.test(segment);

/** True when `path` (concrete or a pattern) is served by `pattern`. */
export function matchRoutePattern(pattern: string, path: string): boolean {
  const expected = splitPath(pattern);
  const actual = splitPath(path);
  for (let i = 0; i < expected.length; i++) {
    const segment = expected[i];
    if (isCatchAll(segment)) {
      return actual.length > i;
    }
    const value = actual[i];
    if (value === undefined) {
      return false;
    }
    if (isDynamic(segment)) {
      continue;
    }
    if (segment !== value) {
      return false;
    }
  }
  return actual.length === expected.length;
}

/** Static segments first, catch-alls last: `/call/new` must win over `/call/[id]`. */
const specificity = (pattern: string): number => {
  const segments = splitPath(pattern);
  if (segments.some(isCatchAll)) {
    return -1;
  }
  return segments.reduce((score, segment) => score + (isDynamic(segment) ? 1 : 100), 0);
};

/**
 * Declares the canonical routes a variant has. Only routes with a file in the variant's route tree belong here — the
 * per-variant route contract test (`assertRouteContract`) fails otherwise.
 */
export function defineRoutes(keys: readonly RouteKey[]): RouteContract {
  for (const key of keys) {
    if (!isRouteKey(key)) {
      throw new Error(`defineRoutes: "${String(key)}" is not a canonical route (packages/app-shell/src/routes/canonical.ts).`);
    }
  }
  const declared = Array.from(new Set(keys));
  const set = new Set<RouteKey>(declared);
  const ranked = [...declared].sort((a, b) => specificity(CANONICAL_ROUTES[b].pattern) - specificity(CANONICAL_ROUTES[a].pattern));
  return Object.freeze({
    keys: Object.freeze(declared),
    has: (key: RouteKey) => set.has(key),
    resolve: (path: string) => ranked.find((key) => matchRoutePattern(CANONICAL_ROUTES[key].pattern, path)) ?? null,
  });
}
