import { defineConfig, devices } from '@playwright/test';

import type { ConsoleGuardOptions, VariantWorkerOptions } from './support/variant-fixtures';
import { selectedWebVariants, VARIANT_IDS } from './support/variants';

// UI acceptance tests for the web export and the packaged Electron app (omni-plan §12).
//   web-<variant>      apps/omni/dist/<variant> served by a static server (APP_VARIANT=<v> pnpm --filter @resgrid/omni web:export)
//   desktop-<variant>  the unpacked Electron build from apps/desktop (skipped when absent)
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
    ...VARIANT_IDS.map((variantId) => ({
      name: `desktop-${variantId}`,
      testDir: './desktop',
      use: { variantId },
    })),
  ],
});
