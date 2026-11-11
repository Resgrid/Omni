import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAppConfig, VARIANT_IDS } = require('@resgrid/config-plugins');
const variantIds: string[] = VARIANT_IDS;

/** One `plugins` entry of the Expo config: a plugin specifier, or the specifier and its options. */
type PluginEntry = string | [string, unknown];

const projectRoot = path.resolve(__dirname, '..');
const build = (variant: string, appEnv = 'production', runNumber = 7) => createAppConfig({ variant, appEnv, runNumber, projectRoot, env: {} });
const pluginNames = (config: { plugins: PluginEntry[] }) => config.plugins.map((p) => path.basename(Array.isArray(p) ? p[0] : p));
const pluginSpecifiers = (config: { plugins: PluginEntry[] }) => config.plugins.map((p) => (Array.isArray(p) ? p[0] : p));

describe('app.config per variant', () => {
  // Snapshot = the reviewable record of identity, permissions and native modules per app. A diff here
  // means a store-visible change (AGENTS.md: review the `expo config` snapshot for every variant).
  it.each(variantIds)('%s production config is stable', (variant) => {
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
      const buildProperties = config.plugins.find((p: PluginEntry) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
      expect(buildProperties.ios).not.toHaveProperty('enableSceneSupport');
    }
  });

  // Google Play limits apps whose code is under 25% obfuscated (docs/build/google-play-checks.md).
  it.each(variantIds)('%s release builds run R8 with the keep rules for code that reflects by name', (variant) => {
    const { android } = build(variant).plugins.find((p: PluginEntry) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
    expect(android.enableMinifyInReleaseBuilds).toBe(true);
    // Channels and in-call audio find their res/raw sounds by name, which the resource shrinker cannot see.
    expect(android.enableShrinkResourcesInReleaseBuilds).toBe(false);

    for (const rule of [
      '-keep class expo.modules.location.** { *; }',
      '-keep class ly.count.android.sdk.** { *; }',
      'org.maplibre.android.maps.renderer.surfaceview.MapLibreSurfaceView { *** detachedListener; *** renderThread; }',
      '-keepnames class com.facebook.react.views.scroll.ReactNestedScrollView',
      '-keepclassmembers,allowobfuscation enum expo.modules.** { !static <fields>; }',
      '-dontwarn livekit.org.jni_zero.JniZeroJni',
    ]) {
      expect(android.extraProguardRules).toContain(rule);
    }
  });

  it('passes expo-navigation-bar only the options it reads under edge-to-edge', () => {
    for (const variant of variantIds) {
      expect(build(variant).plugins.find((p: PluginEntry) => Array.isArray(p) && p[0] === 'expo-navigation-bar')).toEqual(['expo-navigation-bar', { hidden: true }]);
    }
  });

  it('keeps the iOS dev-client network inspector off', () => {
    // It never completes a forwarded `WWW-Authenticate: Basic` challenge, so the token endpoint's 401 invalid_client hung sign-in.
    for (const variant of variantIds) {
      const buildProperties = build(variant).plugins.find((p: PluginEntry) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
      expect(buildProperties.ios.networkInspector).toBe(false);
    }
  });

  it('links native modules only where the variant needs them', () => {
    expect(pluginNames(build('bigboard'))).not.toContain('react-native-callkeep');
    expect(pluginNames(build('bigboard'))).not.toContain('expo-audio');
    expect(pluginNames(build('bigboard'))).not.toContain('react-native-webrtc');
    expect(pluginNames(build('responder'))).toContain('expo-calendar');
    expect(pluginNames(build('unit'))).not.toContain('expo-calendar');
    expect(pluginNames(build('ic'))).toContain('withoutBackgroundLocation.js');
    expect(pluginNames(build('unit'))).not.toContain('withoutBackgroundLocation.js');
  });

  // docs/build/app-icons-and-splash.md: every path the config names exists, and the splash fits Android 12+'s mask.
  it.each(variantIds)('%s uses its generated icon set and splash', (variant) => {
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
    const splash = config.plugins.find((p: PluginEntry) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash).toEqual({ backgroundColor: expect.any(String), image: `${assets}/splash-icon.png`, imageWidth: 200, dark: { backgroundColor: expect.any(String) } });
    expect(splash.imageWidth).toBeLessThanOrEqual(288);
    const notifications = config.plugins.find((p: PluginEntry) => Array.isArray(p) && p[0] === 'expo-notifications')[1];
    const files = [config.icon, ...Object.values(config.ios.icon), ...Object.values(config.android.adaptiveIcon).filter((v) => String(v).startsWith('./')), splash.image, notifications.icon, config.web.favicon];
    files.forEach((file) => expect(fs.existsSync(path.resolve(projectRoot, String(file)))).toBe(true));
  });

  it('badges every icon of non-store builds and none of store builds', () => {
    const badge = (config: { plugins: PluginEntry[] }) => config.plugins.find((p: PluginEntry) => Array.isArray(p) && String(p[0]).endsWith('with-icon-badge.js')) as [string, { badges: { text: string }[] }] | undefined;
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
    const manifestPlugin = (env: string) => build('responder', env).plugins.find((p: PluginEntry) => Array.isArray(p) && String(p[0]).endsWith('custom-manifest.js'));
    expect(manifestPlugin('development')[1]).toEqual({ allowCleartextTraffic: true });
    expect(manifestPlugin('production')[1]).toEqual({ allowCleartextTraffic: false });
  });

  // eas build --local resolves the fingerprint runtime in the checkout and again in its build directory, and stops when the
  // two differ; the fingerprint jobs (Ubuntu) must also match the iOS binaries (macOS). So the config names no checkout path.
  it.each(variantIds)('%s config is the same in every checkout', (variant) => {
    const repoRoot = path.resolve(projectRoot, '..', '..');

    for (const appEnv of ['production', 'staging']) {
      const config = build(variant, appEnv);
      expect(JSON.stringify(config)).not.toContain(repoRoot);
      expect(pluginSpecifiers(config).filter((specifier) => path.isAbsolute(specifier))).toEqual([]);
      const ownPlugins = pluginSpecifiers(config).filter((specifier) => specifier.startsWith('@resgrid/config-plugins/'));
      expect(ownPlugins.length).toBeGreaterThan(0);
      // Expo resolves these from the project root to the workspace package (Jest's moduleNameMapper would send them to src/).
      ownPlugins.forEach((specifier) => expect(fs.existsSync(path.join(repoRoot, 'packages', 'config-plugins', specifier.slice('@resgrid/config-plugins/'.length)))).toBe(true));
    }
  });

  it.each(variantIds)('%s adds the livekit/podspecs Podfile source for the autolinked LiveKitWebRTC pod', (variant) => {
    // LiveKitWebRTC 150.7871.04+ is not on CocoaPods trunk; BigBoard (no livekit module) still links the pod.
    expect(pluginSpecifiers(build(variant))).toContain('@livekit/react-native-expo-plugin');
  });

  it('declares the Live Activity widget App Group to EAS, the group the widget plugin writes', () => {
    const widgetAppGroups = (variant: string, appEnv: string) => {
      const config = build(variant, appEnv);
      const [extension] = config.extra.eas.build.experimental.ios.appExtensions;
      const pluginIndex = pluginSpecifiers(config).findIndex((specifier) => specifier.endsWith('with-live-activities.js'));
      expect(extension.entitlements['com.apple.security.application-groups']).toEqual([config.plugins[pluginIndex][1].appGroupId]);

      return extension.entitlements['com.apple.security.application-groups'];
    };

    // Store builds use the manifest's group, registered on the Apple team (Responder keeps legacy Responder's); the other
    // environments use group.<bundle id>, also registered. eas-cli cannot assign a group to an App ID with an API key, so a
    // group that is not registered and assigned there fails the archive.
    expect(widgetAppGroups('responder', 'production')).toEqual(['group.com.wavetech.resgrid.shared']);
    expect(widgetAppGroups('responder', 'staging')).toEqual(['group.com.wavetech.Resgrid.staging']);
    expect(widgetAppGroups('unit', 'production')).toEqual(['group.com.resgrid.unit.shared']);
    expect(widgetAppGroups('unit', 'internal')).toEqual(['group.com.resgrid.unit.shared']);
    expect(widgetAppGroups('unit', 'staging')).toEqual(['group.com.resgrid.unit.staging']);
    expect(widgetAppGroups('unit', 'development')).toEqual(['group.com.resgrid.unit.development']);
    expect(build('unit').ios.entitlements['com.apple.security.application-groups']).toEqual(['group.com.resgrid.unit.shared']);
    expect(build('ic').extra.eas.build).toBeUndefined();
  });
});
