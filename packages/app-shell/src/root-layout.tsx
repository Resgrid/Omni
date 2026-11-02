import { captureBoundaryError, wrapRootComponent } from '@resgrid/core';
import { ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps, Stack } from 'expo-router';
import React, { useEffect } from 'react';

import { useNavigationReadyRegistration, useSamlDeepLinks } from './deep-links/navigation';
import { RootProviders } from './providers/root-providers';
import { SessionServices } from './session/session-services';
import { useScreenViewTracking } from './telemetry/screen-views';

function ShellRootLayout() {
  useNavigationReadyRegistration();
  useSamlDeepLinks();
  useScreenViewTracking();
  return (
    <RootProviders>
      <SessionServices />
      <Stack screenOptions={{ headerShown: false }} />
    </RootProviders>
  );
}

/**
 * Root layout shared by every variant (omni-plan §5.4): the provider stack, the init phases and session services, and
 * a header-less Stack. The navigator is always mounted — gates, the signed-in shell and the init overlay live in the
 * `(app)` group layout (`createAppShell`) — so deep links and cold-start push taps can always land. Wrapped for Sentry
 * (touch breadcrumbs, interaction spans, end of app start) like every legacy root layout.
 */
export const RootLayout = wrapRootComponent(ShellRootLayout);

/**
 * expo-router's error screen for a route that failed to render, reported to Sentry first: React hands caught render
 * errors to the native exception manager or the console, never to Sentry.
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  const { error } = props;
  useEffect(() => {
    captureBoundaryError(error);
  }, [error]);
  return <RouterErrorBoundary {...props} />;
}
