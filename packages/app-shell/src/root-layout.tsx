import { Stack } from 'expo-router';
import React from 'react';

import { useNavigationReadyRegistration, useSamlDeepLinks } from './deep-links/navigation';
import { RootProviders } from './providers/root-providers';
import { SessionServices } from './session/session-services';

/**
 * Root layout shared by every variant (omni-plan §5.4): the provider stack, the init phases and session services, and
 * a header-less Stack. The navigator is always mounted — gates, the signed-in shell and the init overlay live in the
 * `(app)` group layout (`createAppShell`) — so deep links and cold-start push taps can always land.
 */
export function RootLayout() {
  useNavigationReadyRegistration();
  useSamlDeepLinks();
  return (
    <RootProviders>
      <SessionServices />
      <Stack screenOptions={{ headerShown: false }} />
    </RootProviders>
  );
}

export { ErrorBoundary } from 'expo-router';
