import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { _electron as electron, type ElectronApplication } from '@playwright/test';

import { loadQaManifest } from './qa-departments';
import { test as qaTest } from './qa-fixtures';
import { repoRoot, webExportDir } from './variants';

const desktopDir = path.join(repoRoot, 'apps', 'desktop');
const desktopRequire = createRequire(path.join(desktopDir, 'package.json'));

interface StagedBundle {
  dir: string;
  /** Where the shell serves the bundle: app://bundle (Dispatch app://.), or BigBoard's loopback origin. */
  origin: string;
}

/** The part of apps/desktop's variant-config.json the origin comes from. */
interface DesktopVariantConfig {
  bundleHost: string;
  loopback: { host: string; port: number } | null;
}

interface PrepareBundle {
  prepareBundle: (options: { variant: string; bundleDir: string; webDir: string; log?: { log: () => void } }) => { config: DesktopVariantConfig };
}

interface VariantConfig {
  bundleOriginFor: (config: DesktopVariantConfig) => string;
}

interface QaDesktopWorkerFixtures {
  qaElectronBundle: StagedBundle;
}

interface QaDesktopTestFixtures {
  electronApp: ElectronApplication;
}

/**
 * The QA regression fixtures in the Electron shell: apps/desktop's main process, preload, app:// protocol and CSP serving
 * this variant's web export, as `pnpm --filter @resgrid/desktop dev --export` runs it. Unpackaged on purpose: a packaged
 * build keeps its profile in the installed app's folder, and signing that in to the QA server would replace a real
 * sign-in on this machine; here every test gets an empty profile (RESGRID_DESKTOP_APPDATA_DIR). The staged copy of the
 * export carries an env-config.js naming the QA API, as the Docker image writes one at start.
 */
export const test = qaTest.extend<QaDesktopTestFixtures, QaDesktopWorkerFixtures>({
  qaElectronBundle: [
    async ({ variantId }, provide, workerInfo) => {
      const manifest = loadQaManifest();
      // SAFETY: apps/desktop/scripts/lib/prepare-bundle.js exports prepareBundle with this signature (CommonJS, no types).
      const { prepareBundle } = desktopRequire('./scripts/lib/prepare-bundle') as PrepareBundle;
      // SAFETY: apps/desktop/src/core/variant-config.js exports bundleOriginFor(config) (CommonJS, no types).
      const { bundleOriginFor } = desktopRequire('./src/core/variant-config') as VariantConfig;
      const dir = path.join(workerInfo.project.outputDir, `electron-bundle-${variantId}-${workerInfo.parallelIndex}`);
      const { config } = prepareBundle({ variant: variantId, bundleDir: dir, webDir: webExportDir(variantId), log: { log: () => undefined } });
      const web = path.join(dir, 'web');

      fs.writeFileSync(path.join(web, 'env-config.js'), `window.__ENV__ = Object.assign(window.__ENV__ || {}, ${JSON.stringify({ BASE_API_URL: manifest?.apiUrl ?? '' })});\n`);
      // First in <head>, before the bundle, as docker/entrypoint.sh injects it.
      const index = path.join(web, 'index.html');

      fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('<head>', '<head><script src="/env-config.js"></script>'));
      await provide({ dir, origin: bundleOriginFor(config) });
    },
    { scope: 'worker' },
  ],

  baseURL: async ({ qaElectronBundle }, provide) => provide(qaElectronBundle.origin),

  electronApp: async ({ qaElectronBundle }, provide, testInfo) => {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE'));
    // SAFETY: the electron package's main export is the path of its binary when required from Node.
    const executablePath = desktopRequire('electron') as string;

    const app = await electron.launch({
      executablePath,
      // The QA stack's certificate is self-signed; Linux CI runners cannot use the SUID sandbox.
      args: ['--ignore-certificate-errors', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), desktopDir],
      env: { ...env, RESGRID_DESKTOP_BUNDLE_DIR: qaElectronBundle.dir, RESGRID_DESKTOP_APPDATA_DIR: testInfo.outputPath('profile') },
      timeout: 60_000,
    });

    await provide(app);
    await app.close();
  },

  // The Electron window stands in for the browser page; web-fixtures' console guard and the QA fixtures attach to it.
  page: async ({ electronApp }, provide) => {
    const window = await electronApp.firstWindow();

    await window.waitForLoadState('domcontentloaded');
    await provide(window);
  },
});

export { expect } from './qa-fixtures';
