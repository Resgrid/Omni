import { HomePage } from '../pages/home-page';
import { otherVariants } from '../support/variants';
import { expect, test } from '../support/web-fixtures';

// Runs once per variant (project `web-<variant>`) against apps/omni/dist/<variant>. Every test also fails on
// console errors, uncaught exceptions and 4xx/5xx responses for the export's own files (see web-fixtures.ts).

test.describe('boot', () => {
  test('opens on the variant home screen', async ({ page, manifest }) => {
    const home = new HomePage(page);
    await home.open();
    await home.expectVariant(manifest);
  });

  test('document metadata identifies the variant', async ({ page, request, manifest }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(manifest.identity.name);
    await expect(page.locator('html')).toHaveAttribute('lang', /\S+/);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);

    const icon = await page.locator('link[rel~="icon"]').first().getAttribute('href');
    expect(icon, 'favicon link').toBeTruthy();
    expect((await request.get(icon ?? '')).ok(), `favicon ${icon} is served`).toBe(true);

    // A web app manifest is optional today (web.output "single" emits none); when one is linked it must name this app.
    const manifestLinks = page.locator('link[rel="manifest"]');
    if ((await manifestLinks.count()) > 0) {
      const href = (await manifestLinks.first().getAttribute('href')) ?? '';
      const webManifest = (await (await request.get(href)).json()) as { name?: string; short_name?: string };
      expect(webManifest.name).toBe(manifest.identity.name);
    }
  });

  test('bundle carries only this variant', async ({ page, request, manifest }) => {
    await page.goto('/');
    const scripts = await page.locator('script[src]').evaluateAll((elements) => elements.map((element) => (element as HTMLScriptElement).src));
    expect(scripts.length, 'entry scripts').toBeGreaterThan(0);
    const code = (await Promise.all(scripts.map(async (src) => (await request.get(src)).text()))).join('\n');

    // The route root and manifest are inlined at transform time (per-variant Metro cache, plan §6.2); another
    // variant's identity in this bundle means a cache or config leak between apps.
    // Boolean checks on purpose: a failing toContain() would print the whole (megabyte) bundle into the log.
    expect(code.includes(manifest.identity.easProjectId), `bundle carries ${manifest.id}'s EAS project id`).toBe(true);
    for (const other of otherVariants(manifest.id)) {
      expect(code.includes(other.identity.easProjectId), `bundle carries ${other.id}'s EAS project id`).toBe(false);
      expect(code.includes(`"${other.identity.ios.bundleIdentifier}"`), `bundle carries ${other.id}'s bundle identifier`).toBe(false);
    }
  });
});
