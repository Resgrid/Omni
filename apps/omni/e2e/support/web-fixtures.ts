import { expect } from '@playwright/test';

import { startStaticServer, type StaticServer } from './static-server';
import { isAllowed, variantTest } from './variant-fixtures';
import { hasWebExport, webExportDir } from './variants';

interface WebWorkerFixtures {
  webServer: StaticServer;
}

interface WebTestFixtures {
  /** Errors collected from the page; the test fails at teardown when any were logged. */
  consoleErrors: string[];
}

/**
 * Web acceptance fixtures: one static server per worker serving `apps/omni/dist/<variant>` (the same folder the
 * Docker image and Electron package), `baseURL` pointed at it, and an automatic guard that fails a test when the
 * page logs console errors, throws, or gets a 4xx/5xx for one of its own files.
 */
export const test = variantTest.extend<WebTestFixtures, WebWorkerFixtures>({
  webServer: [
    async ({ variantId }, provide) => {
      if (!hasWebExport(variantId)) {
        throw new Error(`No web export in ${webExportDir(variantId)}. Run: APP_VARIANT=${variantId} pnpm --filter @resgrid/omni web:export`);
      }
      const server = await startStaticServer(webExportDir(variantId));
      await provide(server);
      await server.close();
    },
    { scope: 'worker' },
  ],

  baseURL: async ({ webServer }, provide) => provide(webServer.url),

  consoleErrors: [
    async ({ page, allowedConsoleErrors, webServer }, provide, testInfo) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !isAllowed(message.text(), allowedConsoleErrors)) errors.push(`console.error: ${message.text()}`);
      });
      page.on('pageerror', (error) => {
        if (!isAllowed(error.message, allowedConsoleErrors)) errors.push(`uncaught: ${error.message}`);
      });
      page.on('response', (response) => {
        if (response.url().startsWith(webServer.url) && response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
      });

      await provide(errors);

      if (errors.length) await testInfo.attach('page-errors.txt', { body: errors.join('\n'), contentType: 'text/plain' });
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
