import { expect, type Locator } from '@playwright/test';

import type { VariantManifest } from '../support/variants';
import { AppPage } from './app-page';

/**
 * The app's first screen. Since the Phase 2 shell (@resgrid/app-shell) a fresh, signed-out install opens on the
 * ShellGate (testID `shell-gate`: sign-in, or onboarding on iOS/Android) instead of the home screen; a signed-in session
 * opens on the home screen — today `HomePlaceholder` (testID `home-placeholder`). Both show the variant's
 * `identity.name`. When the real homes land, keep this class as the single place that knows how to recognise "the app
 * is up on its first screen".
 */
export class HomePage extends AppPage {
  get root(): Locator {
    return this.byTestId('home-placeholder').or(this.byTestId('shell-gate'));
  }

  async expectVariant(manifest: VariantManifest): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.root.getByText(manifest.identity.name, { exact: true }).first()).toBeVisible();
  }
}
