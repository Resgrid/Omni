import { _electron as electron, type ElectronApplication, expect, type Page } from '@playwright/test';

import { findDesktopApp } from './electron-app';
import { isAllowed, variantTest } from './variant-fixtures';

interface DesktopTestFixtures {
  electronApp: ElectronApplication;
  /** The first BrowserWindow, with the same console-error guard as the web suite. */
  window: Page;
}

/**
 * Electron smoke fixtures: launch the variant's packaged (unpacked) build. Tests are skipped when no build is
 * present, so the desktop projects are safe to run anywhere; the Linux Electron job in release.yml runs them
 * right after packaging.
 */
export const test = variantTest.extend<DesktopTestFixtures>({
  electronApp: async ({ manifest }, provide, testInfo) => {
    const app = findDesktopApp(manifest);
    if (!app) {
      testInfo.skip(true, `No packaged ${manifest.identity.electron.productName} build found. Build apps/desktop for "${manifest.id}" or set E2E_DESKTOP_EXECUTABLE.`);
      return;
    }
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const electronApp = await electron.launch({ executablePath: app.executable, args: app.args, env, timeout: 60_000 });
    await provide(electronApp);
    await electronApp.close();
  },

  window: async ({ electronApp, allowedConsoleErrors }, provide, testInfo) => {
    const errors: string[] = [];
    const window = await electronApp.firstWindow();
    window.on('console', (message) => {
      if (message.type() === 'error' && !isAllowed(message.text(), allowedConsoleErrors)) errors.push(`console.error: ${message.text()}`);
    });
    window.on('pageerror', (error) => {
      if (!isAllowed(error.message, allowedConsoleErrors)) errors.push(`uncaught: ${error.message}`);
    });
    await window.waitForLoadState('domcontentloaded');

    await provide(window);

    if (errors.length) await testInfo.attach('window-errors.txt', { body: errors.join('\n'), contentType: 'text/plain' });
    expect(errors, 'the window logged errors').toEqual([]);
  },
});

export { expect };
