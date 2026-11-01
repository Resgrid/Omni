// electron-builder configuration generated from each variant manifest: identity, protocols, release-asset names
// (omni-plan §6.6.4), targets, update feed, signing and notarization switches, and what goes into the installer.
const path = require('path');

const { loadAllVariants, loadVariant } = require('@resgrid/config-plugins');

const { APP_STAGE_DIR, DESKTOP_DIR, MODULES_STAGE_DIR, artifactNames, createAppPackageJson, createBuilderConfig, macNotarize, runtimeDependencyNames, windowsSigning } = require('../builder-config');

const relative = (p) => path.relative(DESKTOP_DIR, p).split(path.sep).join('/');

const build = (variant, options = {}) => createBuilderConfig({ manifest: loadVariant(variant), runNumber: 12, env: {}, electronVersion: '40.0.0', ...options });

const targets = (platformConfig) => platformConfig.target.map((t) => `${t.target}:${t.arch.join('+')}`);

describe('createBuilderConfig', () => {
  it('matches the per-variant snapshot (identity, protocols, artifact names, targets)', () => {
    const summary = loadAllVariants().map((manifest) => {
      const config = createBuilderConfig({ manifest, runNumber: 12, env: {}, electronVersion: '40.0.0' });
      return {
        variant: manifest.id,
        appId: config.appId,
        productName: config.productName,
        version: config.extraMetadata.version,
        name: config.extraMetadata.name,
        protocols: config.protocols,
        artifactNames: { mac: config.mac.artifactName, dmg: config.dmg.artifactName, nsis: config.nsis.artifactName, portable: config.portable.artifactName, linux: config.linux.artifactName },
        targets: { mac: targets(config.mac), win: targets(config.win), linux: targets(config.linux) },
        output: relative(config.directories.output),
      };
    });
    expect(summary).toMatchSnapshot();
  });

  it('names Unit 8.12 assets as the release plan lists them', () => {
    const names = artifactNames(loadVariant('unit'), '8.12');
    const expand = (pattern, arch, ext) => pattern.replace('${arch}', arch).replace('${ext}', ext);
    expect(expand(names.nsis, 'x64', 'exe')).toBe('ResgridUnit-8.12-windows-setup.exe');
    expect(expand(names.portable, 'x64', 'exe')).toBe('ResgridUnit-8.12-windows-portable.exe');
    expect(expand(names.mac, 'arm64', 'dmg')).toBe('ResgridUnit-8.12-macos-arm64.dmg');
    expect(expand(names.mac, 'x64', 'zip')).toBe('ResgridUnit-8.12-macos-x64.zip');
    expect(expand(names.linux, 'x64', 'AppImage')).toBe('ResgridUnit-8.12-linux.AppImage');
    expect(expand(names.linux, 'x64', 'deb')).toBe('ResgridUnit-8.12-linux.deb');
  });

  it('versions from the release run and ignores CI build-number variables', () => {
    const config = build('responder', { runNumber: 7 });
    expect(config.extraMetadata.version).toBe('11.7.0');
    expect(config.buildNumber).toBe('7');
    expect(build('bigboard', { runNumber: 0 }).extraMetadata.version).toBe('4.0.0');
  });

  it('packs only the staged shell, web export and runtime modules', () => {
    const config = build('unit');
    expect(config.directories.app).toBe(APP_STAGE_DIR);
    expect(config.files).toEqual(expect.arrayContaining(['src/**/*', 'app-bundle/**/*', '!src/**/__tests__/**', '!**/*.map']));
    expect(config.files).toContainEqual({ from: MODULES_STAGE_DIR, to: 'node_modules', filter: ['**/*'] });
    expect(config.files.some((pattern) => typeof pattern === 'string' && /apps\/omni|node_modules/.test(pattern))).toBe(false);
    expect(runtimeDependencyNames().sort()).toEqual(['@eneris/push-receiver', 'electron-updater']);
    expect(config.asar).toBe(true);
    expect(config.npmRebuild).toBe(false);
    expect(config.electronLanguages).toEqual(expect.arrayContaining(['en-US', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk']));
  });

  it('uses per-variant icons, with an .ico when the variant has one', () => {
    expect(build('unit').win.icon).toMatch(/variants[\\/]unit[\\/]assets[\\/]icon\.ico$/);
    expect(build('bigboard').win.icon).toMatch(/variants[\\/]bigboard[\\/]assets[\\/]icon\.png$/);
    expect(build('bigboard').nsis.installerIcon).toBeUndefined();
    expect(build('ic').mac.icon).toMatch(/variants[\\/]ic[\\/]assets[\\/]icon\.png$/);
  });

  it('macOS: hardened runtime with entitlements and usage descriptions', () => {
    const { mac } = build('dispatch');
    expect(mac.hardenedRuntime).toBe(true);
    expect(mac.entitlements).toMatch(/packaging[\\/]entitlements\.mac\.plist$/);
    expect(mac.extendInfo.NSMicrophoneUsageDescription).toContain('Resgrid Dispatch');
    expect(mac.notarize).toBe(false);
  });

  it('publishes a generic feed per variant and channel only when UPDATE_BASE_URL is set', () => {
    expect(build('unit').publish).toBeNull();
    expect(build('ic', { channel: 'internal', env: { UPDATE_BASE_URL: 'https://dl.resgrid.com' } }).publish).toEqual([{ provider: 'generic', url: 'https://dl.resgrid.com/updates/ic/internal/' }]);
    expect(JSON.stringify(build('ic', { env: { UPDATE_BASE_URL: 'https://dl.resgrid.com' } }))).not.toContain('"github"');
  });

  it('requires signing only when asked', () => {
    expect(build('unit').forceCodeSigning).toBe(false);
    expect(build('unit', { env: { DESKTOP_REQUIRE_SIGNING: '1' } }).forceCodeSigning).toBe(true);
  });
});

describe('createAppPackageJson', () => {
  it('names the packaged app after the variant, with no dependency specs', () => {
    expect(createAppPackageJson(loadVariant('ic'), 5)).toEqual({
      name: 'resgrid-ic',
      productName: 'Resgrid IC',
      version: '2.5.0',
      description: 'Resgrid IC',
      main: 'src/main.js',
      private: true,
      author: { name: 'Resgrid, LLC', email: 'team@resgrid.com' },
      homepage: 'https://resgrid.com',
      license: 'Apache-2.0',
      packageManager: 'npm@10.9.0',
    });
  });
});

describe('windowsSigning', () => {
  const azure = { AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net', AZURE_TRUSTED_SIGNING_ACCOUNT: 'resgrid', AZURE_TRUSTED_SIGNING_PROFILE: 'public', WIN_PUBLISHER_NAME: 'Resgrid, LLC' };

  it('prefers Azure Trusted Signing', () => {
    const signing = windowsSigning({ ...azure, WIN_CSC_LINK: 'cert.pfx' });
    expect(signing.mode).toBe('azure');
    expect(signing.options.azureSignOptions).toEqual({ endpoint: azure.AZURE_TRUSTED_SIGNING_ENDPOINT, codeSigningAccountName: 'resgrid', certificateProfileName: 'public', publisherName: 'Resgrid, LLC' });
    expect(build('unit', { env: azure }).win.azureSignOptions.publisherName).toBe('Resgrid, LLC');
  });

  it('falls back to a PFX, then to unsigned', () => {
    expect(windowsSigning({ WIN_CSC_LINK: 'cert.pfx', WIN_PUBLISHER_NAME: 'Resgrid, LLC' })).toEqual({ mode: 'pfx', options: { signtoolOptions: { publisherName: 'Resgrid, LLC' } } });
    expect(windowsSigning({ CSC_LINK: 'cert.pfx' }).mode).toBe('pfx');
    expect(windowsSigning({ AZURE_TRUSTED_SIGNING_ENDPOINT: 'x' })).toEqual({ mode: 'none', options: {} });
    expect(build('unit').win.azureSignOptions).toBeUndefined();
  });
});

describe('macNotarize', () => {
  it('turns on with any complete credential set', () => {
    expect(macNotarize({})).toBe(false);
    expect(macNotarize({ APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'b' })).toBe(false);
    expect(macNotarize({ APPLE_API_KEY: '/k.p8', APPLE_API_KEY_ID: 'id', APPLE_API_ISSUER: 'iss' })).toBe(true);
    expect(macNotarize({ APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'b', APPLE_TEAM_ID: 'c' })).toBe(true);
    expect(macNotarize({ APPLE_KEYCHAIN: 'k', APPLE_KEYCHAIN_PROFILE: 'p' })).toBe(true);
    expect(build('unit', { env: { APPLE_KEYCHAIN: 'k', APPLE_KEYCHAIN_PROFILE: 'p' } }).mac.notarize).toBe(true);
  });
});
