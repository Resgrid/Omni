import { initI18n } from '@resgrid/i18n';

import { sessionInit, startupInit } from './init/app-init';
import { registerDefaultInitSteps } from './init/default-steps';
import { applyAppShellConfig, type AppShellConfig, getOptionalAppShellConfig } from './runtime/shell-config';

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
 * and navigation, registers gate screens and the default init steps. The background-location bootstrap is registered by
 * the app entry (apps/omni/index.ts), which must do it before anything mounts; it calls `runBackgroundStartup()`.
 */
export function configureAppShell(config: AppShellConfig): void {
  // Before the first render: react-i18next's useTranslation skips its state hook while no instance is registered and
  // adds it once one is, which changes the hook order of every mounted component (React error #311).
  initI18n({ variantResources: config.i18nResources });
  applyAppShellConfig(config);
  if (config.options?.registerDefaultSteps !== false) {
    registerDefaultInitSteps(startupInit, sessionInit, config);
  }
}

/**
 * Brings the platform packages up without UI — what a background location relaunch needs before it can queue a fix:
 * storage, the restored session and `configureLocation` (the startup phase; idempotent, so a run already in flight is
 * joined). The variant root layout must have called `configureAppShell` first. Rejects when startup failed, so the
 * location bootstrap logs it and a later batch tries again.
 */
export async function runBackgroundStartup(): Promise<void> {
  if (!getOptionalAppShellConfig()) {
    throw new Error('runBackgroundStartup: the app shell is not configured (load the variant root layout first).');
  }
  const status = await startupInit.run();
  if (status.state === 'failed') {
    throw status.error ?? new Error(`Startup failed at ${status.failedStep ?? 'an unknown step'}.`);
  }
}
