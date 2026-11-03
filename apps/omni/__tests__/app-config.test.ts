import fs from 'node:fs';
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

  it('points expo-router at the variant route tree, with web async routes off', () => {
    expect(build('ic').plugins[0]).toEqual(['expo-router', { root: './variants/ic/app', asyncRoutes: { web: false } }]);
  });

  it('turns on no experimental or beta Expo features', () => {
    for (const variant of ['responder', 'unit', 'ic', 'dispatch', 'bigboard']) {
      const config = build(variant);
      expect(config.experiments).toBeUndefined();
      const buildProperties = config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
      expect(buildProperties.ios).not.toHaveProperty('enableSceneSupport');
      // SDK 58 defaults R8 on; release builds keep it off until they have run on devices.
      expect(buildProperties.android.enableMinifyInReleaseBuilds).toBe(false);
    }
  });

  it('keeps the iOS dev-client network inspector off', () => {
    // It never completes a forwarded `WWW-Authenticate: Basic` challenge, so the token endpoint's 401 invalid_client hung sign-in.
    for (const variant of VARIANT_IDS) {
      const buildProperties = build(variant).plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
      expect(buildProperties.ios.networkInspector).toBe(false);
    }
  });

  it('links native modules only where the variant needs them', () => {
    expect(pluginNames(build('bigboard'))).not.toContain('react-native-callkeep');
    expect(pluginNames(build('bigboard'))).not.toContain('expo-audio');
    expect(pluginNames(build('responder'))).toContain('expo-calendar');
    expect(pluginNames(build('unit'))).not.toContain('expo-calendar');
    expect(pluginNames(build('ic'))).toContain('withoutBackgroundLocation.js');
    expect(pluginNames(build('unit'))).not.toContain('withoutBackgroundLocation.js');
  });

  // docs/build/app-icons-and-splash.md: every path the config names exists, and the splash fits Android 12+'s mask.
  it.each(VARIANT_IDS as string[])('%s uses its generated icon set and splash', (variant) => {
    const config = build(variant);
    const assets = `./variants/${variant}/assets`;
    expect(config.icon).toBe(`${assets}/icon.png`);
    expect(config.ios.icon).toEqual({ light: `${assets}/icon.png`, dark: `${assets}/ios-icon-dark.png`, tinted: `${assets}/ios-icon-tinted.png` });
    expect(config.android.adaptiveIcon).toEqual({
      foregroundImage: `${assets}/adaptive-icon.png`,
      backgroundImage: `${assets}/adaptive-icon-background.png`,
      monochromeImage: `${assets}/adaptive-icon-monochrome.png`,
      backgroundColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
    });
    const splash = config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash).toEqual({ backgroundColor: expect.any(String), image: `${assets}/splash-icon.png`, imageWidth: 200, dark: { backgroundColor: expect.any(String) } });
    expect(splash.imageWidth).toBeLessThanOrEqual(288);
    const notifications = config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications')[1];
    const files = [config.icon, ...Object.values(config.ios.icon), ...Object.values(config.android.adaptiveIcon).filter((v) => String(v).startsWith('./')), splash.image, notifications.icon, config.web.favicon];
    files.forEach((file) => expect(fs.existsSync(path.resolve(projectRoot, String(file)))).toBe(true));
  });

  it('badges every icon of non-store builds and none of store builds', () => {
    const badge = (config: { plugins: unknown[] }) => config.plugins.find((p: unknown) => Array.isArray(p) && String(p[0]).endsWith('with-icon-badge.js')) as [string, { badges: { text: string }[] }] | undefined;
    expect(badge(build('ic', 'production'))).toBeUndefined();
    expect(badge(build('ic', 'internal'))).toBeUndefined();
    const staging = build('ic', 'staging');
    expect(badge(staging)?.[1].badges.map((b) => b.text)).toEqual(['staging', staging.version]);
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
