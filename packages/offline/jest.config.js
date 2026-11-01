// Node preset plus in-memory fakes for the native modules @resgrid/offline wraps, so every test runs
// in Node: react-native-mmkv, expo-sqlite (node:sqlite in-memory), expo-secure-store, expo-crypto and
// NetInfo. Fakes live in src/__tests__/fakes.
const path = require('path');

const preset = require('../../tooling/jest-preset/node');

const fake = (name) => path.join(__dirname, 'src', '__tests__', 'fakes', `${name}.ts`);

module.exports = {
  ...preset,
  displayName: 'offline',
  rootDir: __dirname,
  moduleNameMapper: {
    '^react-native-mmkv$': fake('mmkv'),
    '^expo-sqlite$': fake('expo-sqlite'),
    '^expo-secure-store$': fake('expo-secure-store'),
    '^expo-crypto$': fake('expo-crypto'),
    '^@react-native-community/netinfo$': fake('netinfo'),
    ...preset.moduleNameMapper,
  },
};
