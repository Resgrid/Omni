import { HomePage } from '../pages/home-page';
import { test } from '../support/desktop-fixtures';

// Runs once per variant (project `desktop-<variant>`) against the packaged Electron build; skipped when none exists,
// except with E2E_DESKTOP_REQUIRED (the `electron (<variant>)` check in app-platforms.yml), where that fails.

test.describe('desktop boot', () => {
  test('packaged app opens on the variant home screen', async ({ window, manifest }, testInfo) => {
    const home = new HomePage(window);
    await home.waitForBoot();
    await home.expectVariant(manifest);
    // Evidence for reviewers: this variant's first desktop screen, kept with the run's results and report.
    await testInfo.attach(`home-${manifest.id}`, { body: await window.screenshot(), contentType: 'image/png' });
  });
});
