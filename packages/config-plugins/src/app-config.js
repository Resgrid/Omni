// Builds the Expo config for one variant × environment (omni-plan §5.3, §6.2–6.3).
// Everything that differs per app comes from apps/omni/variants/<id>/variant.json; this file only
// translates manifest facts into Expo/EAS settings, so a new per-app value belongs in the manifest.
const fs = require('fs');
const path = require('path');

const { buildClientEnv } = require('./client-env');
const { usage } = require('./usage-strings');
const { loadVariant } = require('./variants');
const { computeVariantVersion } = require('./versioning');

// A package specifier, never an absolute path: the expo config is hashed into the fingerprint runtime version, and a path
// naming the checkout gives every machine and the EAS build directory a different runtime (eas build --local then fails
// with "Runtime version mismatch"). Expo resolves it from the project root; the fingerprint still hashes the file itself.
const plugin = (file) => `@resgrid/config-plugins/plugins/${file}`;

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
  const iosBundleIdentifier = withEnvSuffix(identity.ios.bundleIdentifier, appEnv);

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
    ...(identity.ios.appGroup && has('live-activity') ? { 'com.apple.security.application-groups': [isStoreEnv(appEnv) ? identity.ios.appGroup : `group.${iosBundleIdentifier}`] } : {}),
  };

  // The App Group the Live Activity widget shares with the app; with-live-activities.js writes it into both targets.
  const liveActivityAppGroup = entitlements['com.apple.security.application-groups']?.[0] ?? `group.${iosBundleIdentifier}`;

  const backgroundLocation = caps.location.background && has('background-location');
  // The location purpose strings name turn-by-turn navigation where the app has it.
  const locationUsage = { navigation: caps.maps.navigationInApp };

  const plugins = [
    // Async routes are on for web by default since SDK 58. Off: the screens are reached through feature barrels that the
    // shell registrations import, so they stay in the startup chunks and the route chunks only add round trips
    // (implementation-status "Web bundle, next steps").
    ['expo-router', { root: `./variants/${variant}/app`, asyncRoutes: { web: false } }],
    // Android 12+ draws the image on a 288 dp canvas masked to a 192 dp circle: splash-icon.png keeps the mark inside it
    // at 200 dp, and iOS shows the same image at 200 pt (docs/build/app-icons-and-splash.md).
    ['expo-splash-screen', { backgroundColor: identity.splashBackground, image: `${assets}/splash-icon.png`, imageWidth: 200, dark: { backgroundColor: identity.splashBackgroundDark } }],
    ['expo-font', { fonts: ['./assets/fonts/Inter.ttf'] }],
    'expo-localization',
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
        locationWhenInUsePermission: usage.locationWhenInUse(name, locationUsage),
        ...(backgroundLocation ? { locationAlwaysAndWhenInUsePermission: usage.locationAlways(name, locationUsage), locationAlwaysPermission: usage.locationAlways(name, locationUsage) } : {}),
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
          // SDK 58 turns R8 on for release builds. Kept off (the SDK 57 behaviour) until release builds of every variant
          // have run on devices: notifee, WebRTC, MMKV, CallKeep and MapLibre load classes by reflection.
          enableMinifyInReleaseBuilds: false,
          extraProguardRules: '-keep class expo.modules.location.** { *; }',
          extraMavenRepos: ['../../../node_modules/@notifee/react-native/android/libs'],
          targetSdkVersion: 36,
        },
        ios: {
          deploymentTarget: '18.1',
          // Off: the dev-client network inspector (debug builds only) forwards HTTP auth challenges and never completes
          // them, so a 401 with `WWW-Authenticate: Basic` — the token endpoint's `invalid_client` — hangs until the
          // timeout and sign-in reports the server as unreachable. Re-enable once expo-modules-core handles it.
          networkInspector: false,
          ...(native.iosUseStaticFrameworks ? { useFrameworks: 'static' } : {}),
        },
      },
    ],
    // No expo-asset plugin: it rejects .wav and skips folders, so it embedded nothing. Sounds reach the native projects
    // through withNotificationSounds and withInCallAudioModule; JS loads bundled files with require().
    ['@sentry/react-native/expo', { organization: 'sentry', project: identity.sentryProject, url: 'https://sentry.resgrid.net/' }],
  ];

  if (has('secure-store')) plugins.push(['expo-secure-store', { faceIDPermission: usage.faceId(name) }]);
  if (has('task-manager') && backgroundLocation) plugins.push(['expo-task-manager', { taskManager: { taskName: 'location-updates' } }]);
  if (has('calendar')) plugins.push(['expo-calendar', { calendarPermission: usage.calendars(name) }]);
  if (has('video')) plugins.push('expo-video');
  if (caps.voice.ptt) plugins.push(['expo-audio', { microphonePermission: usage.microphone(name) }]);
  if (has('ble-manager')) plugins.push('react-native-ble-manager');
  // Every app, not only the livekit ones: autolinking adds the LiveKitWebRTC pod to each iOS build, and its current versions
  // are published only to the livekit/podspecs spec repo. Without options this plugin only adds that Podfile source.
  plugins.push('@livekit/react-native-expo-plugin');
  if (has('livekit')) plugins.push(['@config-plugins/react-native-webrtc', { cameraPermission: usage.camera(name) }]);
  if (has('callkeep')) plugins.push('@config-plugins/react-native-callkeep');

  plugins.push(plugin('custom-gradle.js'));
  plugins.push([plugin('custom-manifest.js'), { allowCleartextTraffic: appEnv === 'development' }]);
  // MapLibre replaces @rnmapbox/maps everywhere (MapLibre plan D1, omni-plan D10).
  if (has('maplibre')) plugins.push('@maplibre/maplibre-react-native');

  plugins.push(plugin('withRestrictedBootReceivers.js'));
  if (!backgroundLocation) plugins.push(plugin('withoutBackgroundLocation.js'));
  if (has('notifee')) plugins.push(plugin('withNotificationSounds.js'));
  if (has('media-button')) plugins.push(plugin('withMediaButtonModule.js'));
  if (has('in-call-audio')) plugins.push(plugin('withInCallAudioModule.js'));
  if (has('live-activity')) plugins.push([plugin('with-live-activities.js'), { appGroupId: liveActivityAppGroup }]);
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

  // EAS learns an extension's capabilities only from these entitlements. Without the App Group it switches App Groups off on
  // the widget's App ID (Apple rejected that for Responder) or signs the widget with a profile its entitlements file
  // does not match.
  const appExtensions = has('live-activity')
    ? [{ targetName: 'CheckInTimerWidget', bundleIdentifier: `${iosBundleIdentifier}.CheckInTimerWidget`, entitlements: { 'com.apple.security.application-groups': [liveActivityAppGroup] } }]
    : [];

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
      icon: { light: `${assets}/icon.png`, dark: `${assets}/ios-icon-dark.png`, tinted: `${assets}/ios-icon-tinted.png` },
      buildNumber: String(versionInfo.buildNumber),
      supportsTablet: true,
      requireFullScreen: true,
      bundleIdentifier: iosBundleIdentifier,
      ...(env.IOS_APPLE_TEAM_ID ? { appleTeamId: env.IOS_APPLE_TEAM_ID } : {}),
      ...(isStoreEnv(appEnv) && identity.ios.associatedDomains.length ? { associatedDomains: identity.ios.associatedDomains } : {}),
      ...(iosGoogleServicesExists ? { googleServicesFile: iosGoogleServicesFile } : {}),
      infoPlist,
      entitlements,
    },
    android: {
      versionCode: versionInfo.buildNumber,
      adaptiveIcon: {
        foregroundImage: `${assets}/adaptive-icon.png`,
        backgroundImage: `${assets}/adaptive-icon-background.png`,
        monochromeImage: `${assets}/adaptive-icon-monochrome.png`,
        backgroundColor: identity.adaptiveIconBackground,
      },
      softwareKeyboardLayoutMode: 'resize',
      package: withEnvSuffix(identity.android.package, appEnv),
      ...(googleServicesExists ? { googleServicesFile } : {}),
      intentFilters: [{ action: 'VIEW', autoVerify: false, data: lowerSchemes.map((scheme) => ({ scheme })), category: ['BROWSABLE', 'DEFAULT'] }],
      permissions: native.androidPermissions,
      blockedPermissions: native.androidBlockedPermissions,
    },
    web: { favicon: `${assets}/favicon.png`, bundler: 'metro', output: 'single' },
    plugins,
    extra: {
      variant,
      appEnv,
      version: versionInfo,
      env: buildClientEnv(m, appEnv, env),
      router: { root: `./variants/${variant}/app` },
      location: { background: backgroundLocation, transmission: caps.location.transmission },
      eas: {
        projectId: identity.easProjectId,
        ...(appExtensions.length ? { build: { experimental: { ios: { appExtensions } } } } : {}),
      },
    },
  };
}

module.exports = { createAppConfig, withEnvSuffix, isStoreEnv };
