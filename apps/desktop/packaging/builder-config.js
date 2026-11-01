'use strict';
// electron-builder configuration for one variant, generated from its manifest (omni-plan §6.5, §6.6.4). Used by
// scripts/build.mjs (programmatic build) and electron-builder.config.js (CLI). Packaging baseline: the legacy Unit/IC
// electron-builder.config.js (dmg + zip x64/arm64 with hardened runtime, NSIS + portable, AppImage/deb/rpm), plus code
// signing, notarization and the generic auto-update feed, each enabled only when its environment is present.
//
// The installer carries only this package's src/ and the copied web export (app-bundle/); the React Native app's
// node_modules never enter it (legacy installers were 387 MB because they did).

const fs = require('fs');
const path = require('path');

const { computeVariantVersion, variantsDir } = require('@resgrid/config-plugins');

const { resolveUpdateFeedUrl } = require('../src/core/update-feed');
const { artifactPrefixFor } = require('../src/core/variant-config');

const DESKTOP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..', '..');
// Staging written by scripts/build.mjs (apps/desktop/out is git-ignored at the repo root).
const APP_STAGE_DIR = path.join(DESKTOP_DIR, 'out', 'app');
const MODULES_STAGE_DIR = path.join(DESKTOP_DIR, 'out', 'runtime-modules');

// Chromium UI locales kept in the installer: the app's ten languages (resgrid-i18n), plus regional English/Spanish.
const ELECTRON_LANGUAGES = ['en-US', 'en-GB', 'ar', 'de', 'el', 'es', 'es-419', 'fr', 'it', 'pl', 'sv', 'uk'];

const has = (env, ...names) => names.every((name) => typeof env[name] === 'string' && env[name].trim() !== '');

/** Release-asset names (omni-plan §6.6.4: `ResgridUnit-8.12-windows-setup.exe`, `-macos-arm64.dmg`, `-linux.AppImage` …). */
function artifactNames(manifest, version) {
  const prefix = `${artifactPrefixFor(manifest)}-${version}`;
  return {
    // `${arch}` / `${ext}` are electron-builder macros, expanded per target.
    mac: `${prefix}-macos-\${arch}.\${ext}`,
    nsis: `${prefix}-windows-setup.\${ext}`,
    portable: `${prefix}-windows-portable.\${ext}`,
    linux: `${prefix}-linux.\${ext}`,
  };
}

/**
 * Windows code signing, by preference: Azure Trusted Signing, then a PFX certificate, else unsigned.
 * Azure: AZURE_TRUSTED_SIGNING_ENDPOINT, _ACCOUNT, _PROFILE and WIN_PUBLISHER_NAME here; the signing tool reads the Entra
 * credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) itself.
 * PFX: WIN_CSC_LINK (path, https URL or base64) and WIN_CSC_KEY_PASSWORD, read by electron-builder itself.
 */
function windowsSigning(env) {
  if (has(env, 'AZURE_TRUSTED_SIGNING_ENDPOINT', 'AZURE_TRUSTED_SIGNING_ACCOUNT', 'AZURE_TRUSTED_SIGNING_PROFILE', 'WIN_PUBLISHER_NAME')) {
    return {
      mode: 'azure',
      options: {
        azureSignOptions: {
          endpoint: env.AZURE_TRUSTED_SIGNING_ENDPOINT,
          codeSigningAccountName: env.AZURE_TRUSTED_SIGNING_ACCOUNT,
          certificateProfileName: env.AZURE_TRUSTED_SIGNING_PROFILE,
          publisherName: env.WIN_PUBLISHER_NAME,
        },
      },
    };
  }
  if (has(env, 'WIN_CSC_LINK') || has(env, 'CSC_LINK')) {
    return { mode: 'pfx', options: has(env, 'WIN_PUBLISHER_NAME') ? { signtoolOptions: { publisherName: env.WIN_PUBLISHER_NAME } } : {} };
  }
  return { mode: 'none', options: {} };
}

/** Notarization runs when one of electron-builder's credential sets is present (API key preferred). */
function macNotarize(env) {
  return has(env, 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER') || has(env, 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID') || has(env, 'APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE');
}

function variantIcons(manifest) {
  const assets = path.join(variantsDir, manifest.id, 'assets');
  const png = path.join(assets, 'icon.png');
  const ico = path.join(assets, 'icon.ico');
  if (!fs.existsSync(png)) {
    throw new Error(`Missing ${png}: every variant needs a square icon.png (512 px or larger) for the desktop app.`);
  }
  // electron-builder derives .icns (macOS) and, without an .ico, the Windows icon from the PNG.
  return { png, ico: fs.existsSync(ico) ? ico : null };
}

function installedVersion(name) {
  return require(require.resolve(`${name}/package.json`, { paths: [DESKTOP_DIR] })).version;
}

function installedElectronVersion() {
  return installedVersion('electron');
}

/** Runtime dependencies of the shell (workspace packages are build-time only and stay out of the installer). */
function runtimeDependencyNames() {
  const { dependencies = {} } = require(path.join(DESKTOP_DIR, 'package.json'));
  return Object.keys(dependencies).filter((name) => !dependencies[name].startsWith('workspace:'));
}

/**
 * The package.json packed into the app (out/app/package.json): Electron's app name and version, and the entry point.
 * The profile folder is set explicitly at runtime from variant-config (userDataDir), not derived from this name.
 * `packageManager` makes electron-builder's dependency detection deterministic for the staged folder; the runtime
 * node_modules come from out/runtime-modules (scripts/lib/runtime-modules.js).
 */
function createAppPackageJson(manifest, runNumber = 0) {
  const { electronVersion } = computeVariantVersion(manifest, runNumber);
  return {
    name: manifest.identity.slug,
    productName: manifest.identity.electron.productName,
    version: electronVersion,
    description: manifest.identity.name,
    main: 'src/main.js',
    private: true,
    author: { name: 'Resgrid, LLC', email: 'team@resgrid.com' },
    homepage: 'https://resgrid.com',
    license: 'Apache-2.0',
    packageManager: 'npm@10.9.0',
  };
}

/**
 * @param {{
 *   manifest: object,
 *   runNumber?: number,
 *   channel?: string,
 *   env?: Record<string, string | undefined>,
 *   electronVersion?: string,
 *   appDir?: string,
 *   modulesDir?: string,
 * }} options
 *   appDir: the staged app (package.json, src/, app-bundle/), relative to apps/desktop or absolute;
 *   modulesDir: the staged runtime node_modules (absolute).
 * @returns {import('electron-builder').Configuration}
 */
function createBuilderConfig({ manifest, runNumber = 0, channel = 'production', env = process.env, electronVersion = installedElectronVersion(), appDir = APP_STAGE_DIR, modulesDir = MODULES_STAGE_DIR }) {
  const electron = manifest.identity.electron;
  const { version, electronVersion: appVersion } = computeVariantVersion(manifest, runNumber);
  const names = artifactNames(manifest, version);
  const icons = variantIcons(manifest);
  const feedUrl = resolveUpdateFeedUrl(env.UPDATE_BASE_URL, manifest.id, channel);
  const signing = windowsSigning(env);
  const slug = manifest.identity.slug;
  const appName = manifest.identity.name;
  const license = path.join(REPO_ROOT, 'LICENSE');

  return {
    appId: electron.appId,
    productName: electron.productName,
    copyright: `Copyright © ${new Date().getUTCFullYear()} Resgrid, LLC`,
    electronVersion,
    // Release run M (Windows FileVersion major.minor.patch.M); independent of CI's BUILD_NUMBER variables.
    buildNumber: String(runNumber),
    directories: { app: appDir, output: path.join(DESKTOP_DIR, 'release', manifest.id), buildResources: path.join(DESKTOP_DIR, 'packaging') },
    files: ['package.json', 'src/**/*', '!src/**/__tests__/**', '!src/**/*.test.js', 'app-bundle/**/*', '!**/*.map', { from: modulesDir, to: 'node_modules', filter: ['**/*'] }],
    // Same identity as the staged package.json, so a stale staging folder can never ship another version or name.
    extraMetadata: { name: slug, productName: electron.productName, version: appVersion },
    asar: true,
    // Pure-JS runtime dependencies only (push receiver, updater): nothing to rebuild for Electron.
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    electronLanguages: ELECTRON_LANGUAGES,
    protocols: electron.protocol ? [{ name: electron.productName, schemes: [electron.protocol] }] : [],
    // Generic feed per variant and channel; null (no latest*.yml, no app-update.yml) when UPDATE_BASE_URL is unset.
    publish: feedUrl ? [{ provider: 'generic', url: feedUrl }] : null,
    detectUpdateChannel: false,
    generateUpdatesFilesForAllChannels: false,
    forceCodeSigning: env.DESKTOP_REQUIRE_SIGNING === '1',

    mac: {
      category: 'public.app-category.productivity',
      target: [
        { target: 'dmg', arch: ['x64', 'arm64'] },
        { target: 'zip', arch: ['x64', 'arm64'] },
      ],
      icon: icons.png,
      artifactName: names.mac,
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: path.join(DESKTOP_DIR, 'packaging', 'entitlements.mac.plist'),
      entitlementsInherit: path.join(DESKTOP_DIR, 'packaging', 'entitlements.mac.plist'),
      darkModeSupport: true,
      notarize: macNotarize(env),
      extendInfo: {
        NSMicrophoneUsageDescription: `${appName} uses the microphone for Push-to-Talk and voice calls with your department.`,
        NSCameraUsageDescription: `${appName} uses the camera for photos you attach to calls and for department video sessions.`,
        NSLocationUsageDescription: `${appName} uses your location to show your position on the department map.`,
        NSLocationWhenInUseUsageDescription: `${appName} uses your location to show your position on the department map.`,
      },
    },
    dmg: {
      artifactName: names.mac,
      contents: [
        { x: 130, y: 220 },
        { x: 410, y: 220, type: 'link', path: '/Applications' },
      ],
      window: { width: 540, height: 380 },
    },

    win: {
      target: [
        { target: 'nsis', arch: ['x64'] },
        { target: 'portable', arch: ['x64'] },
      ],
      icon: icons.ico || icons.png,
      ...signing.options,
    },
    nsis: {
      artifactName: names.nsis,
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: electron.productName,
      deleteAppDataOnUninstall: false,
      ...(icons.ico ? { installerIcon: icons.ico, uninstallerIcon: icons.ico, installerHeaderIcon: icons.ico } : {}),
      ...(fs.existsSync(license) ? { license } : {}),
    },
    portable: { artifactName: names.portable },

    linux: {
      target: [
        { target: 'AppImage', arch: ['x64'] },
        { target: 'deb', arch: ['x64'] },
        { target: 'rpm', arch: ['x64'] },
      ],
      icon: icons.png,
      artifactName: names.linux,
      executableName: slug,
      category: 'Office',
      maintainer: 'Resgrid <team@resgrid.com>',
      vendor: 'Resgrid',
      synopsis: appName,
      desktop: { entry: { Name: electron.productName, Comment: appName, Categories: 'Office;Utility;' } },
    },
    deb: { packageName: slug },
  };
}

module.exports = { APP_STAGE_DIR, DESKTOP_DIR, ELECTRON_LANGUAGES, MODULES_STAGE_DIR, artifactNames, createAppPackageJson, createBuilderConfig, macNotarize, runtimeDependencyNames, windowsSigning };
