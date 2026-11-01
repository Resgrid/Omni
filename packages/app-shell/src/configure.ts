import { initI18n } from '@resgrid/i18n';
import { registerBackgroundLocationBootstrap } from '@resgrid/location';

import { sessionInit, startupInit } from './init/app-init';
import { registerDefaultInitSteps } from './init/default-steps';
import { applyAppShellConfig, type AppShellConfig } from './runtime/shell-config';

/**
 * The variant root layout's one registration call, right after `setActiveVariant(variant)`:
 *
 * ```ts
 * setActiveVariant(variant);
 * configureAppShell({ variant, i18nResources: unitResources, nav, routes });
 * export { RootLayout as default } from '@resgrid/app-shell';
 * ```
 *
 * Initialises translations (device language; the stored choice follows once storage is open), sets the route contract
 * and navigation, registers gate screens and the default init steps, and lets a background location relaunch run the
 * same (idempotent) startup steps before it queues a fix.
 */
export function configureAppShell(config: AppShellConfig): void {
  // Before the first render: react-i18next's useTranslation skips its state hook while no instance is registered and
  // adds it once one is, which changes the hook order of every mounted component (React error #311).
  initI18n({ variantResources: config.i18nResources });
  applyAppShellConfig(config);
  if (config.options?.registerDefaultSteps !== false) {
    registerDefaultInitSteps(startupInit, sessionInit, config);
  }
  if (config.variant.capabilities.location.background) {
    registerBackgroundLocationBootstrap(async () => {
      await startupInit.run();
    });
  }
}
