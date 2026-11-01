// Jest preset for packages and screens that render React Native components (jest-expo).
const path = require('path');
const expoPreset = require('jest-expo/jest-preset');
const { moduleNameMapper } = require('./module-map');

module.exports = {
  preset: 'jest-expo',
  moduleNameMapper,
  // Packages resolved through their `react-native` export condition can ship `.mjs` (lucide-react-native 1.x);
  // jest-expo only transforms .js/.ts, so run .mjs through the same Babel setup. Jest merges this with the preset's map.
  transform: { '\\.mjs$': expoPreset.transform['\\.[jt]sx?$'] },
  setupFilesAfterEnv: [path.join(__dirname, 'setup-react-native.js')],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/*.test.[jt]s?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@gluestack-ui|nativewind|react-native-css|lucide-react-native|@shopify/flash-list|@livekit|livekit-client|@notifee|@novu|@legendapp|zustand))',
  ],
  clearMocks: true,
};
