'use strict';
// Stages what the desktop shell runs for one variant: the variant's web export, its icon and variant-config.json, in one
// folder (out/app/app-bundle/ for packaging, out/dev-bundle/ for dev runs). Shared by build.mjs and dev.mjs; CommonJS so Jest can
// test it.

const fs = require('fs');
const path = require('path');

const { computeVariantVersion, loadVariant, variantsDir } = require('@resgrid/config-plugins');

const { createVariantConfig } = require('../../src/core/variant-config');

const DESKTOP_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..', '..');

function defaultWebDir(variant) {
  return path.join(REPO_ROOT, 'apps', 'omni', 'dist', variant);
}

function directorySize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

/**
 * @param {{
 *   variant: string,
 *   bundleDir: string,
 *   webDir?: string | null,      web export to copy; null to skip (dev-server runs)
 *   runNumber?: number,
 *   channel?: string,
 *   updateBaseUrl?: string | null,
 *   log?: { warn: Function },
 * }} options
 */
function prepareBundle({ variant, bundleDir, webDir = defaultWebDir(variant), runNumber = 0, channel = 'production', updateBaseUrl = null, log = console }) {
  const manifest = loadVariant(variant);
  const { electronVersion } = computeVariantVersion(manifest, runNumber);
  const config = createVariantConfig(manifest, { version: electronVersion, channel, updateBaseUrl });

  let webSource = null;
  if (webDir) {
    webSource = path.resolve(webDir);
    const index = path.join(webSource, 'index.html');
    if (!fs.existsSync(index)) {
      throw new Error(`No web export at ${webSource}. Build it first:\n  cd apps/omni && APP_VARIANT=${variant} npx expo export -p web --output-dir dist/${variant}`);
    }
    // Packaging another variant's export would ship the wrong app under this one's identity.
    const title = /<title>([^<]*)<\/title>/i.exec(fs.readFileSync(index, 'utf8'));
    if (title && title[1].trim() !== manifest.identity.name) {
      log.warn(`Warning: ${index} has title "${title[1].trim()}", expected "${manifest.identity.name}". Is this the ${variant} export?`);
    }
  }

  const target = path.resolve(bundleDir);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  if (webSource) {
    fs.cpSync(webSource, path.join(target, 'web'), { recursive: true, filter: (source) => !source.endsWith('.map') });
  }
  fs.copyFileSync(path.join(variantsDir, variant, 'assets', 'icon.png'), path.join(target, 'icon.png'));
  fs.writeFileSync(path.join(target, 'variant-config.json'), `${JSON.stringify(config, null, 2)}\n`);

  return { manifest, config, bundleDir: target, webBytes: webSource ? directorySize(path.join(target, 'web')) : 0 };
}

/**
 * Stages the complete app electron-builder packs: out/app/{package.json, src/, app-bundle/} plus out/runtime-modules/
 * (the runtime dependency closure, packed as node_modules). Nothing from the React Native app enters it.
 * @param {Parameters<typeof prepareBundle>[0] & { appDir?: string, modulesDir?: string }} options
 */
function stageApp({ appDir, modulesDir, ...options }) {
  const { APP_STAGE_DIR, MODULES_STAGE_DIR, createAppPackageJson, runtimeDependencyNames } = require('../../packaging/builder-config');
  const { stageRuntimeModules } = require('./runtime-modules');
  const appTarget = path.resolve(appDir || APP_STAGE_DIR);
  const modulesTarget = path.resolve(modulesDir || MODULES_STAGE_DIR);

  fs.rmSync(appTarget, { recursive: true, force: true });
  fs.mkdirSync(appTarget, { recursive: true });
  fs.cpSync(path.join(DESKTOP_DIR, 'src'), path.join(appTarget, 'src'), {
    recursive: true,
    filter: (source) => path.basename(source) !== '__tests__' && !/\.test\.[jt]s$/.test(source),
  });
  const bundle = prepareBundle({ ...options, bundleDir: path.join(appTarget, 'app-bundle') });
  fs.writeFileSync(path.join(appTarget, 'package.json'), `${JSON.stringify(createAppPackageJson(bundle.manifest, options.runNumber || 0), null, 2)}\n`);

  const modules = stageRuntimeModules({
    dependencies: runtimeDependencyNames(),
    fromDir: DESKTOP_DIR,
    roots: [path.join(DESKTOP_DIR, 'node_modules'), path.join(REPO_ROOT, 'node_modules')],
    outDir: modulesTarget,
  });

  return { ...bundle, appDir: appTarget, modulesDir: modulesTarget, modules, modulesBytes: directorySize(modulesTarget) };
}

module.exports = { DESKTOP_DIR, REPO_ROOT, defaultWebDir, directorySize, prepareBundle, stageApp };
