import { test as base } from '@playwright/test';

import { loadManifest, type VariantId, type VariantManifest } from './variants';

/** Worker options set per Playwright project (`web-<variant>`, `desktop-<variant>`) in playwright.config.ts. */
export interface VariantWorkerOptions {
  variantId: VariantId;
}

export interface VariantWorkerFixtures extends VariantWorkerOptions {
  manifest: VariantManifest;
}

export interface ConsoleGuardOptions {
  /** Console errors matching one of these are tolerated (keep the list short and explain each entry). */
  allowedConsoleErrors: RegExp[];
}

/** Base for every acceptance suite: which variant this project runs and its manifest. */
export const variantTest = base.extend<ConsoleGuardOptions, VariantWorkerFixtures>({
  variantId: ['unit', { scope: 'worker', option: true }],
  manifest: [async ({ variantId }, provide) => provide(loadManifest(variantId)), { scope: 'worker' }],
  allowedConsoleErrors: [[], { option: true }],
});

export function isAllowed(text: string, allowed: RegExp[]): boolean {
  return allowed.some((re) => re.test(text));
}
