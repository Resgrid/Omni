// Builds the Expo config for one variant × environment (omni-plan §5.3, §6.2–6.3).
// Everything that differs per app comes from apps/omni/variants/<id>/variant.json; this file only
// translates manifest facts into Expo/EAS settings, so a new per-app value belongs in the manifest.
const fs = require('fs');
const path = require('path');

const { buildClientEnv } = require('./client-env');
const { usage } = require('./usage-strings');
const { loadVariant } = require('./variants');
const { computeVariantVersion } = require('./versioning');

const pluginsDir = path.resolve(__dirname, '..', 'plugins');
const plugin = (file) => path.join(pluginsDir, file);

const isStoreEnv = (appEnv) => appEnv === 'production' || appEnv === 'internal';
const withEnvSuffix = (id, appEnv) => (isStoreEnv(appEnv) ? id : `${id}.${appEnv}`);

/**
 * @param {object} options
 * @param {string} options.variant           variant id
 * @param {string} options.appEnv            development | staging | internal | production
 * @param {number} options.runNumber         release.yml run number (0 for local builds)
 * @param {string} options.projectRoot       absolute path of apps/omni
 * @param {Record<string, string|undefined>} [options.env]
 * @param {object} [options.baseConfig]      config passed in by Expo (ConfigContext.config)
 */
function createAppConfig({ variant, appEnv, runNumber, projectRoot, env = process.env, baseConfig = {} }) {
  const m = loadVariant(variant);
  const { identity, native, capabilities: caps } = m;
  const name = identity.name;
  const has = (mod) => native.modules.includes(mod);
  const versionInfo = computeVariantVersion(m, runNumber);
  const assets = `./variants/${variant}/assets`;
  const lowerSchemes = [...new Set(identity.schemes.map((s) => s.toLowerCase()))];

  const googleServicesFile = env.GOOGLE_SERVICES_FILE || './google-services.json';
  const googleServicesExists = fs.existsSync(path.resolve(projectRoot, googleServicesFile));
  const iosGoogleServicesFile = env.IOS_GOOGLE_SERVICES_FILE || './GoogleService-Info.plist';
  const iosGoogleServicesExists = fs.existsSync(path.resolve(projectRoot, iosGoogleServicesFile));

  const infoPlist = {
    UIBackgroundModes: native.iosBackgroundModes,
    ITSAppUsesNonExemptEncryption: false,
    UIViewControllerBasedStatusBarAppearance: false,
    LSApplicationQueriesSchemes: [...lowerSchemes, 'waze', 'comgooglemaps', 'osmandmaps', 'here-route'],
    ...(has('ble-manager') ? { NSBluetoothAlwaysUsageDescription: usage.bluetooth(name) } : {}),
    ...(has('live-activity') ? { NSSupportsLiveActivities: true } : {}),
  };

  const entitlements = {
    'aps-environment': 'production',
    ...(isStoreEnv(appEnv) ? { 'com.apple.developer.usernotifications.critical-alerts': true, 'com.apple.developer.usernotifications.time-sensitive': true } : {}),
    ...(identity.ios.appGroup && has('live-activity') ? { 'com.apple.security.application-groups': [isStoreEnv(appEnv) ? identity.ios.appGroup : `group.${withEnvSuffix(identity.ios.bundleIdentifier, appEnv)}`] } : {}),
  };

  const backgroundLocation = caps.location.background && has('background-location');

  const plugins = [
    ['expo-router', { root: `./variants/${variant}/app` }],
    ['expo-splash-screen', { backgroundColor: identity.splashBackground, image: `${assets}/adaptive-icon.png`, imageWidth: 250 }],
    ['expo-font', { fonts: ['./assets/fonts/Inter.ttf'] }],
    'expo-localization',
    'react-native-edge-to-edge',
    'expo-web-browser',
    'expo-image',
    'expo-sharing',
    'expo-status-bar',
    'expo-sqlite',
    ['expo-notifications', { icon: `${assets}/notification-icon.png`, color: identity.notificationColor }],
    ['expo-screen-orientation', { initialOrientation: 'DEFAULT' }],
    ['expo-document-picker', { iCloudContainerEnvironment: 'Production' }],
    ['expo-image-picker', { photosPermission: usage.photos(name), cameraPermission: usage.camera(name) }],
    ['expo-navigation-bar', { position: 'relative', hidden: true, behavior: 'inset-touch' }],
    [
      'expo-location',
      {
        locationWhenInUsePermission: usage.locationWhenInUse(name),
        ...(backgroundLocation ? { locationAlwaysAndWhenInUsePermission: usage.locationAlways(name), locationAlwaysPermission: usage.locationAlways(name) } : {}),
        motionUsagePermission: usage.motion(name),
        isIosBackgroundLocationEnabled: backgroundLocation,
        isAndroidBackgroundLocationEnabled: backgroundLocation,
        isAndroidForegroundServiceEnabled: backgroundLocation,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          extraProguardRules: '-keep class expo.modules.location.** { *; }',
          extraMavenRepos: ['../../../node_modules/@notifee/react-native/android/libs'],
          targetSdkVersion: 36,
        },
        ios: {
          deploymentTarget: '18.1',
          enableSceneSupport: true,
          ...(native.iosUseStaticFrameworks ? { useFrameworks: 'static' } : {}),
        },
      },
    ],
    ['expo-asset', { assets: ['./assets/audio'] }],
    ['@sentry/react-native/expo', { organization: 'sentry', project: identity.sentryProject, url: 'https://sentry.resgrid.net/' }],
  ];

  if (has('secure-store')) plugins.push(['expo-secure-store', { faceIDPermission: usage.faceId(name) }]);
  if (has('task-manager') && backgroundLocation) plugins.push(['expo-task-manager', { taskManager: { taskName: 'location-updates' } }]);
  if (has('calendar')) plugins.push(['expo-calendar', { calendarPermission: usage.calendars(name) }]);
  if (has('video')) plugins.push('expo-video');
  if (caps.voice.ptt) plugins.push(['expo-audio', { microphonePermission: usage.microphone(name) }]);
  if (has('ble-manager')) plugins.push('react-native-ble-manager');
  if (has('livekit')) {
    plugins.push('@livekit/react-native-expo-plugin');
    plugins.push(['@config-plugins/react-native-webrtc', { cameraPermission: usage.camera(name) }]);
  }
  if (has('callkeep')) plugins.push('@config-plugins/react-native-callkeep');

  plugins.push(plugin('custom-gradle.js'));
  plugins.push([plugin('custom-manifest.js'), { allowCleartextTraffic: appEnv === 'development' }]);
  plugins.push(plugin('withRestrictedBootReceivers.js'));
  if (!backgroundLocation) plugins.push(plugin('withoutBackgroundLocation.js'));
  if (has('notifee')) plugins.push(plugin('withNotificationSounds.js'));
  if (has('media-button')) plugins.push(plugin('withMediaButtonModule.js'));
  if (has('in-call-audio')) plugins.push(plugin('withInCallAudioModule.js'));
  if (has('live-activity')) plugins.push([plugin('with-live-activities.js'), { appGroupId: entitlements['com.apple.security.application-groups']?.[0] }]);
  if (native.iosUseStaticFrameworks && has('livekit')) plugins.push(plugin('withWebRTCFrameworkFix.js'));
  plugins.push(plugin('withResourceBundleDeploymentTarget.js'));
  if (!isStoreEnv(appEnv)) {
    plugins.push([
      plugin('with-icon-badge.js'),
      {
        enabled: true,
        badges: [
          { text: appEnv, type: 'banner', color: 'white' },
          { text: versionInfo.version, type: 'ribbon', color: 'white' },
        ],
      },
    ]);
  }

  const appExtensions = has('live-activity') ? [{ targetName: 'CheckInTimerWidget', bundleIdentifier: `${withEnvSuffix(identity.ios.bundleIdentifier, appEnv)}.CheckInTimerWidget` }] : [];

  return {
    ...baseConfig,
    name,
    description: `${name} — part of the Resgrid platform`,
    owner: identity.owner,
    slug: identity.slug,
    scheme: identity.schemes.length === 1 ? identity.schemes[0] : identity.schemes,
    version: versionInfo.version,
    orientation: 'default',
    icon: `${assets}/icon.png`,
    userInterfaceStyle: 'automatic',
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${identity.easProjectId}`, fallbackToCacheTimeout: 0 },
    assetBundlePatterns: ['**/*'],
    ios: {
      icon: `${assets}/ios-icon.png`,
      buildNumber: String(versionInfo.buildNumber),
      supportsTablet: true,
      requireFullScreen: true,
      bundleIdentifier: withEnvSuffix(identity.ios.bundleIdentifier, appEnv),
      ...(env.IOS_APPLE_TEAM_ID ? { appleTeamId: env.IOS_APPLE_TEAM_ID } : {}),
      ...(isStoreEnv(appEnv) && identity.ios.associatedDomains.length ? { associatedDomains: identity.ios.associatedDomains } : {}),
      ...(iosGoogleServicesExists ? { googleServicesFile: iosGoogleServicesFile } : {}),
      infoPlist,
      entitlements,
    },
    android: {
      versionCode: versionInfo.buildNumber,
      adaptiveIcon: { foregroundImage: `${assets}/adaptive-icon.png`, backgroundColor: identity.adaptiveIconBackground },
      softwareKeyboardLayoutMode: 'resize',
      package: withEnvSuffix(identity.android.package, appEnv),
      ...(googleServicesExists ? { googleServicesFile } : {}),
      intentFilters: [{ action: 'VIEW', autoVerify: false, data: lowerSchemes.map((scheme) => ({ scheme })), category: ['BROWSABLE', 'DEFAULT'] }],
      permissions: native.androidPermissions,
      blockedPermissions: native.androidBlockedPermissions,
    },
    web: { favicon: `${assets}/favicon.png`, bundler: 'metro', output: 'single' },
    experiments: { typedRoutes: true },
    plugins,
    extra: {
      variant,
      appEnv,
      version: versionInfo,
      env: buildClientEnv(m, appEnv, env),
      router: { root: `./variants/${variant}/app` },
      eas: {
        projectId: identity.easProjectId,
        ...(appExtensions.length ? { build: { experimental: { ios: { appExtensions } } } } : {}),
      },
    },
  };
}

module.exports = { createAppConfig, withEnvSuffix, isStoreEnv };
