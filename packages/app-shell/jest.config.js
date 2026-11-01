// @resgrid/app-shell tests: the shared React Native preset (jest-expo) plus this package's mocks (jest.setup.tsx).
// The platform packages' native modules are replaced by @resgrid/offline's and @resgrid/auth's in-memory fakes; the
// L3 packages that wrap device services (notifications, realtime, location, voice, data) are mocked at their boundary.
const path = require('path');

const preset = require('../../tooling/jest-preset/react-native');

const offlineFake = (name) => path.join(__dirname, '..', 'offline', 'src', '__tests__', 'fakes', `${name}.ts`);
const authFake = (name) => path.join(__dirname, '..', 'auth', 'src', '__tests__', 'fakes', `${name}.ts`);

// gluestack's overlays animate with @legendapp/motion, which ships untranspiled ESM.
const transformIgnorePatterns = preset.transformIgnorePatterns.map((pattern) => pattern.replace('|@gluestack-ui|', '|@gluestack-ui|@legendapp/motion|'));

module.exports = {
  ...preset,
  displayName: 'app-shell',
  rootDir: __dirname,
  // Reanimated 4.7 / worklets resolve their initialisers to the non-native builds under Jest (Reanimated's resolver wraps
  // the worklets one).
  resolver: 'react-native-reanimated/jest/resolver.js',
  transformIgnorePatterns,
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/mocks/', '/__tests__/helpers/'],
  setupFilesAfterEnv: [...preset.setupFilesAfterEnv, '<rootDir>/jest.setup.tsx'],
  moduleNameMapper: {
    '^react-native-mmkv$': offlineFake('mmkv'),
    '^expo-sqlite$': offlineFake('expo-sqlite'),
    '^expo-secure-store$': offlineFake('expo-secure-store'),
    '^@react-native-community/netinfo$': offlineFake('netinfo'),
    '^react-native-passkey$': authFake('react-native-passkey'),
    '^expo-auth-session$': authFake('expo-auth-session'),
    ...preset.moduleNameMapper,
  },
};
