import { expect, type Locator } from '@playwright/test';

import type { VariantManifest } from '../support/variants';
import { AppPage } from './app-page';

/**
 * Home screen. Until each variant's real home is ported (plan Phase 4) this is `HomePlaceholder` from
 * @resgrid/app-shell: testID `home-placeholder`, showing the variant's `identity.name`. When the real homes land,
 * keep this class as the single place that knows how to recognise "the app is on its home screen".
 */
export class HomePage extends AppPage {
  get root(): Locator {
    return this.byTestId('home-placeholder');
  }

  async expectVariant(manifest: VariantManifest): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.root).toHaveText(manifest.identity.name);
  }
}
