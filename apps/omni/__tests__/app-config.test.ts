import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAppConfig, VARIANT_IDS } = require('@resgrid/config-plugins');

const projectRoot = path.resolve(__dirname, '..');
const build = (variant: string, appEnv = 'production', runNumber = 7) => createAppConfig({ variant, appEnv, runNumber, projectRoot, env: {} });
const pluginNames = (config: { plugins: (string | [string, unknown])[] }) => config.plugins.map((p) => path.basename(Array.isArray(p) ? p[0] : p));

describe('app.config per variant', () => {
  // Snapshot = the reviewable record of identity, permissions and native modules per app. A diff here
  // means a store-visible change (AGENTS.md: review the `expo config` snapshot for every variant).
  it.each(VARIANT_IDS as string[])('%s production config is stable', (variant) => {
    const config = build(variant);
    expect({
      name: config.name,
      slug: config.slug,
      scheme: config.scheme,
      version: config.version,
      ios: { bundleIdentifier: config.ios.bundleIdentifier, buildNumber: config.ios.buildNumber, associatedDomains: config.ios.associatedDomains, infoPlist: config.ios.infoPlist, entitlements: config.ios.entitlements },
      android: {
        package: config.android.package,
        versionCode: config.android.versionCode,
        permissions: config.android.permissions,
        blockedPermissions: config.android.blockedPermissions,
        intentFilters: config.android.intentFilters,
      },
      plugins: pluginNames(config),
      projectId: config.extra.eas.projectId,
    }).toMatchSnapshot();
  });

  it('suffixes non-store environments so dev builds install next to store builds', () => {
    expect(build('unit', 'staging').ios.bundleIdentifier).toBe('com.resgrid.unit.staging');
    expect(build('unit', 'internal').ios.bundleIdentifier).toBe('com.resgrid.unit');
  });

  it('points expo-router at the variant route tree', () => {
    expect(build('ic').plugins[0]).toEqual(['expo-router', { root: './variants/ic/app' }]);
  });

  it('links native modules only where the variant needs them', () => {
    expect(pluginNames(build('bigboard'))).not.toContain('react-native-callkeep');
    expect(pluginNames(build('bigboard'))).not.toContain('expo-audio');
    expect(pluginNames(build('responder'))).toContain('expo-calendar');
    expect(pluginNames(build('unit'))).not.toContain('expo-calendar');
    expect(pluginNames(build('ic'))).toContain('withoutBackgroundLocation.js');
    expect(pluginNames(build('unit'))).not.toContain('withoutBackgroundLocation.js');
  });

  it('enables OTA with a fingerprint runtime on the variant EAS project', () => {
    const config = build('dispatch');
    expect(config.runtimeVersion).toEqual({ policy: 'fingerprint' });
    expect(config.updates.url).toBe(`https://u.expo.dev/${config.extra.eas.projectId}`);
  });

  it('allows cleartext traffic only in development', () => {
    const manifestPlugin = (env: string) => build('responder', env).plugins.find((p: unknown) => Array.isArray(p) && String(p[0]).endsWith('custom-manifest.js'));
    expect(manifestPlugin('development')[1]).toEqual({ allowCleartextTraffic: true });
    expect(manifestPlugin('production')[1]).toEqual({ allowCleartextTraffic: false });
  });
});
