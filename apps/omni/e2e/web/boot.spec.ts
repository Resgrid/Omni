import fs from 'node:fs';
import path from 'node:path';

import { HomePage } from '../pages/home-page';
import { LoginPage } from '../pages/login-page';
import { otherVariants, repoRoot, type VariantId, webExportDir } from '../support/variants';
import { expect, test } from '../support/web-fixtures';

/** Every JavaScript file of the export: the entry plus the chunks loaded on demand (languages, maplibre-gl, LiveKit). */
const exportedScripts = (variantId: VariantId): string[] => {
  const dir = path.join(webExportDir(variantId), '_expo', 'static', 'js', 'web');
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.join(dir, file));
};

/** A string of the variant's own namespace in a language, else the common one (initI18n's fallbackNS). */
const translation = (variantId: VariantId, language: string, key: string[]): string => {
  for (const ns of [variantId, 'common']) {
    let node: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages', 'i18n', 'src', 'translations', ns, `${language}.json`), 'utf8'));
    for (const part of key) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
    if (typeof node === 'string') return node;
  }
  throw new Error(`no ${language} string for ${key.join('.')}`);
};

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
    // Chunks loaded on demand (another language, maplibre-gl, LiveKit) are not on the page yet: check them on disk.
    const chunks = exportedScripts(manifest.id);
    expect(chunks.length, 'scripts in the export').toBeGreaterThan(scripts.length);
    const all = [code, ...chunks.map((file) => fs.readFileSync(file, 'utf8'))].join('\n');
    for (const other of otherVariants(manifest.id)) {
      expect(all.includes(other.identity.easProjectId), `bundle carries ${other.id}'s EAS project id`).toBe(false);
      expect(all.includes(`"${other.identity.ios.bundleIdentifier}"`), `bundle carries ${other.id}'s bundle identifier`).toBe(false);
    }
  });
});

test.describe('code splitting', () => {
  // A static import anywhere would pull these back into the entry bundle; Metro then emits no chunk for them.
  test('maplibre-gl, LiveKit and the other languages are chunks of their own', async ({ page, manifest }) => {
    const names = exportedScripts(manifest.id).map((file) => path.basename(file));
    for (const chunk of ['maplibre-gl', 'livekit-client', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk']) {
      expect(names.filter((name) => new RegExp(`^${chunk}-[0-9a-f]+\\.js$`).test(name)).length, `${chunk} chunk`).toBeGreaterThan(0);
    }
    await page.goto('/');
    const entry = await page.locator('script[src]').evaluateAll((elements) => elements.map((element) => (element as HTMLScriptElement).src));
    expect(
      entry.some((src) => /\/(maplibre-gl|livekit-client)-[0-9a-f]+\.js$/.test(src)),
      'heavy chunks in index.html'
    ).toBe(false);
  });
});

test.describe('languages', () => {
  // Only English is in the entry bundle; another language's strings load as a separate chunk when it is chosen.
  test.use({ locale: 'de-DE' });

  test('loads the device language on demand and shows it', async ({ page, manifest }) => {
    const chunkRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/_expo\/static\/js\/web\/de-[0-9a-f]+\.js$/.test(request.url())) chunkRequests.push(request.url());
    });
    const login = new LoginPage(page);
    await login.open();
    await login.expectForm();
    await expect(login.submit).toHaveText(translation(manifest.id, 'de', ['login', 'login_button']));
    // common + the variant's own namespace.
    expect(chunkRequests).toHaveLength(2);
  });
});
