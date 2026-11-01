// Node preset plus controllable fakes for the native modules @resgrid/location drives (react-native AppState/Platform,
// expo-location, expo-task-manager, expo-constants, expo-localization) in src/__tests__/fakes. The native modules
// @resgrid/offline loads at import time reuse offline's own in-memory fakes so tests can run a real outbox.
const path = require('path');

const preset = require('../../tooling/jest-preset/node');

const fake = (name) => path.join(__dirname, 'src', '__tests__', 'fakes', `${name}.ts`);
const offlineFake = (name) => path.join(__dirname, '..', 'offline', 'src', '__tests__', 'fakes', `${name}.ts`);

module.exports = {
  ...preset,
  displayName: 'location',
  rootDir: __dirname,
  moduleNameMapper: {
    '^react-native$': fake('react-native'),
    '^expo-location$': fake('expo-location'),
    '^expo-task-manager$': fake('expo-task-manager'),
    '^expo-constants$': fake('expo-constants'),
    '^expo-localization$': fake('expo-localization'),
    '^react-native-mmkv$': offlineFake('mmkv'),
    '^expo-sqlite$': offlineFake('expo-sqlite'),
    '^expo-secure-store$': offlineFake('expo-secure-store'),
    '^expo-crypto$': offlineFake('expo-crypto'),
    '^@react-native-community/netinfo$': offlineFake('netinfo'),
    ...preset.moduleNameMapper,
  },
};
