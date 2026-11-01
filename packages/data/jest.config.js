// Node preset. @resgrid/data imports @resgrid/offline, whose index loads native modules
// (react-native-mmkv, expo-sqlite, expo-secure-store, expo-crypto, NetInfo); they map to the
// in-memory fakes @resgrid/offline ships for its own tests so the real outbox runs in Node.
const path = require('path');

const preset = require('../../tooling/jest-preset/node');

const fake = (name) => path.join(__dirname, '..', 'offline', 'src', '__tests__', 'fakes', `${name}.ts`);

module.exports = {
  ...preset,
  displayName: 'data',
  rootDir: __dirname,
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  moduleNameMapper: {
    '^react-native-mmkv$': fake('mmkv'),
    '^expo-sqlite$': fake('expo-sqlite'),
    '^expo-secure-store$': fake('expo-secure-store'),
    '^expo-crypto$': fake('expo-crypto'),
    '^@react-native-community/netinfo$': fake('netinfo'),
    ...preset.moduleNameMapper,
  },
};
