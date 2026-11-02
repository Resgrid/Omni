// In-app turn-by-turn (MapLibre plan §9) for variants with `maps.navigationInApp` (Unit): server routes, expo-speech
// prompts, device preferences in the main storage, live ETA reports through the outbox and the navigation location
// profile. Registered as a startup step right after storage opens, so queued ETA reports find their handler.
import { getShellApiContext, getShellOfflineRuntime, registerInitStep, useShellStore } from '@resgrid/app-shell';
import { getActiveVariant } from '@resgrid/config';
import { getCurrentLanguage } from '@resgrid/i18n';
import { configureNavigation, unitsForLocale } from '@resgrid/navigation';

const deviceLocale = (): string => {
  try {
    return Intl.NumberFormat().resolvedOptions().locale;
  } catch {
    return '';
  }
};

export function registerNavigationSteps(): void {
  registerInitStep(
    'startup',
    {
      id: 'startup.navigation',
      enabled: () => getActiveVariant().capabilities.maps.navigationInApp,
      run: () => {
        configureNavigation({
          getApiContext: () => getShellApiContext(),
          getLanguage: () => getCurrentLanguage(),
          isMetric: () => unitsForLocale(deviceLocale()) === 'metric',
          supportsTraffic: () => useShellStore.getState().departmentConfig?.RoutingSupportsTraffic === true,
          storage: getShellOfflineRuntime()?.storage.main ?? null,
        });
      },
    },
    { after: 'startup.offline' }
  );
}
