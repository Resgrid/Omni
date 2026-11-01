// @resgrid/auth tests run in Node: the node preset plus in-memory fakes for the native modules the package wraps.
// Storage fakes are @resgrid/offline's own (MMKV, SQLite, SecureStore, NetInfo); the rest live in src/__tests__/fakes.
const path = require('path');

const preset = require('../../tooling/jest-preset/node');

const fake = (name) => path.join(__dirname, 'src', '__tests__', 'fakes', `${name}.ts`);
const offlineFake = (name) => path.join(__dirname, '..', 'offline', 'src', '__tests__', 'fakes', `${name}.ts`);

module.exports = {
  ...preset,
  displayName: 'auth',
  rootDir: __dirname,
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fakes/', '/__tests__/helpers/'],
  moduleNameMapper: {
    '^react-native$': fake('react-native'),
    '^expo-crypto$': fake('expo-crypto'),
    '^expo-device$': fake('expo-device'),
    '^expo-application$': fake('expo-application'),
    '^expo-web-browser$': fake('expo-web-browser'),
    '^expo-auth-session$': fake('expo-auth-session'),
    '^expo-linking$': fake('expo-linking'),
    '^react-native-passkey$': fake('react-native-passkey'),
    '^react-native-mmkv$': offlineFake('mmkv'),
    '^expo-sqlite$': offlineFake('expo-sqlite'),
    '^expo-secure-store$': offlineFake('expo-secure-store'),
    '^@react-native-community/netinfo$': offlineFake('netinfo'),
    ...preset.moduleNameMapper,
  },
};
