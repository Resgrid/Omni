// Metro for the one Omni Expo project (omni-plan §6.2). Expo auto-configures workspace resolution
// (SDK 52+); this file adds the per-variant cache, web stubs for native-only modules and NativeWind.
const path = require('path');
const { FileStore } = require('metro-cache');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativewind } = require('nativewind/metro');

const projectRoot = __dirname;
const variant = process.env.APP_VARIANT || 'unit';

const config = getSentryExpoConfig(projectRoot, { isCSSEnabled: true });

// The expo-router root and EXPO_PUBLIC_* values are inlined at transform time, so each variant keeps
// its own transform cache; switching APP_VARIANT can never serve another app's bundle.
config.cacheStores = [new FileStore({ root: path.join(projectRoot, '.metro-cache', variant) })];

// zustand's ESM build uses import.meta.env, which Metro's web output does not support.
const zustandCjsRoot = path.dirname(require.resolve('zustand/package.json'));
const zustandSubpathMap = {
  zustand: 'index.js',
  'zustand/vanilla': 'vanilla.js',
  'zustand/traditional': 'traditional.js',
  'zustand/middleware': 'middleware.js',
  'zustand/shallow': 'shallow.js',
  'zustand/context': 'context.js',
  'zustand/middleware/immer': 'middleware/immer.js',
};

const webModuleStubs = {
  'react-native-ble-manager': path.resolve(projectRoot, 'stubs/react-native-ble-manager.web.ts'),
  '@livekit/react-native': path.resolve(projectRoot, 'stubs/livekit-react-native.web.ts'),
  '@livekit/react-native-webrtc': path.resolve(projectRoot, 'stubs/livekit-react-native-webrtc.web.ts'),
  'countly-sdk-react-native-bridge': path.resolve(projectRoot, 'stubs/countly-sdk.web.ts'),
  'countly-sdk-react-native-bridge/CountlyConfig': path.resolve(projectRoot, 'stubs/countly-config.web.ts'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (Object.prototype.hasOwnProperty.call(zustandSubpathMap, moduleName)) {
      return { type: 'sourceFile', filePath: path.join(zustandCjsRoot, zustandSubpathMap[moduleName]) };
    }
    if (Object.prototype.hasOwnProperty.call(webModuleStubs, moduleName)) {
      return { type: 'sourceFile', filePath: webModuleStubs[moduleName] };
    }
  }
  return defaultResolveRequest ? defaultResolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

// The Electron shell is a separate package and must never be bundled into the app.
config.resolver.blockList = [/apps[\/]desktop[\/].*/];

module.exports = withNativewind(config, { inlineRem: 16 });
