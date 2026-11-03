import { defineConfig, devices } from '@playwright/test';

import type { ConsoleGuardOptions, VariantWorkerOptions } from './support/variant-fixtures';
import { selectedWebVariants, VARIANT_IDS } from './support/variants';

// UI acceptance tests for the web export and the packaged Electron app (omni-plan §12).
//   web-<variant>      apps/omni/dist/<variant> served by a static server (APP_VARIANT=<v> pnpm --filter @resgrid/omni web:export)
//   desktop-<variant>  the unpacked Electron build from apps/desktop (skipped when absent)
//   qa-<variant>       the same export signed in to seeded QA departments (E2E_QA_MANIFEST; see e2e/README.md)
// Select web variants with E2E_VARIANT=unit,ic (or `all`); by default every exported variant runs.
// Run through `node scripts/ci/run-playwright.mjs test -c apps/omni/e2e/playwright.config.ts [--project web-unit]`.
const CI = Boolean(process.env.CI);

export default defineConfig<ConsoleGuardOptions, VariantWorkerOptions>({
  testDir: '.',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['list'], ['github'], ['junit', { outputFile: './results/junit.xml' }], ['html', { open: 'never', outputFolder: './playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...selectedWebVariants().map((variantId) => ({
      name: `web-${variantId}`,
      testDir: './web',
      use: { ...devices['Desktop Chrome'], variantId },
    })),
    // The release regression suite against seeded QA departments (e2e/qa): only with E2E_QA_MANIFEST, so a run without a
    // QA server lists no qa-* projects. The QA stack's API uses a self-signed localhost certificate.
    ...(process.env.E2E_QA_MANIFEST
      ? selectedWebVariants().map((variantId) => ({
          name: `qa-${variantId}`,
          testDir: './qa',
          use: {
            ...devices['Desktop Chrome'],
            variantId,
            ignoreHTTPSErrors: true,
            // Chrome logs every non-2xx fetch as "Failed to load resource". The qa fixtures judge Core's answers themselves
            // (apiGuard: any 5xx, or a 4xx that is not a by-design refusal, fails the test); 5xx lines stay console errors.
            allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 4\d\d/],
          },
        }))
      : []),
    // The same suite in the Electron shell serving the export (e2e/qa-desktop): verifies the desktop app on the web assets.
    ...(process.env.E2E_QA_MANIFEST
      ? selectedWebVariants().map((variantId) => ({
          name: `qa-desktop-${variantId}`,
          testDir: './qa-desktop',
          use: { variantId, allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 4\d\d/] },
        }))
      : []),
    ...VARIANT_IDS.map((variantId) => ({
      name: `desktop-${variantId}`,
      testDir: './desktop',
      use: { variantId },
    })),
  ],
});
