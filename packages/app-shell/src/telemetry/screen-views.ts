import { analyticsService } from '@resgrid/core';
import { useSegments } from 'expo-router';
import { useEffect } from 'react';

const isRouteGroup = (segment: string): boolean => segment.startsWith('(') && segment.endsWith(')');

/**
 * The analytics name of a route: its pattern without route groups (`(app)/calls/[id]` → `/calls/[id]`), so views
 * group by screen and no id from the URL is ever sent.
 */
export function screenNameFromSegments(segments: readonly string[]): string {
  return `/${segments.filter((segment) => !isRouteGroup(segment)).join('/')}`;
}

/**
 * Records a Countly view on every route change (Sentry follows navigation through its React Navigation integration).
 * Mount once, in the root layout.
 */
export function useScreenViewTracking(): void {
  const name = screenNameFromSegments(useSegments());
  useEffect(() => {
    analyticsService.trackView(name);
  }, [name]);
}
