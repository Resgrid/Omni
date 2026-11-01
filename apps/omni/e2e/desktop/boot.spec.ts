import { HomePage } from '../pages/home-page';
import { test } from '../support/desktop-fixtures';

// Runs once per variant (project `desktop-<variant>`) against the packaged Electron build; skipped when none exists.

test.describe('desktop boot', () => {
  test('packaged app opens on the variant home screen', async ({ window, manifest }) => {
    const home = new HomePage(window);
    await home.waitForBoot();
    await home.expectVariant(manifest);
  });
});
