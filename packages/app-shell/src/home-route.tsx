import { useActiveVariant } from '@resgrid/config';
import { type Href, Redirect } from 'expo-router';
import React from 'react';

import { HomePlaceholder } from './home-placeholder';
import { normalizeHref } from './nav/define-nav';
import { getRouteContract, useHref } from './routes/href';

/** The route `/` should hand over to: the variant's `shell.homeRoute` when it is another declared route, else null. */
export function resolveHomeRedirect(homeRoute: string): string | null {
  const target = normalizeHref(homeRoute);
  if (target === '/') {
    return null;
  }
  const key = getRouteContract().resolve(target);
  return key !== null && key !== 'home' && key !== 'missing' ? target : null;
}

/**
 * The `(app)` index route (`/`) of every variant: sends the member to the variant's `shell.homeRoute` when that is
 * another route the variant declares (Responder's `/home` member home), else shows the placeholder home. A homeRoute the
 * variant has no route for yet (Dispatch's console, BigBoard's dashboard) keeps the placeholder instead of a dead link.
 */
export function HomeRoute() {
  const variant = useActiveVariant();
  // Subscribes to the route contract (set by configureAppShell).
  useHref();
  const target = resolveHomeRedirect(variant.shell.homeRoute);
  return target ? <Redirect href={target as Href} /> : <HomePlaceholder />;
}
