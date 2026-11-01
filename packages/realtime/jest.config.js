// Node preset plus in-memory fakes so every realtime test (hooks included, via react-test-renderer) runs in Node:
// a controllable @microsoft/signalr, and the React Native / Expo modules @resgrid/core's deep imports touch.
// Fakes live in src/__tests__/fakes.
const path = require('path');

const preset = require('../../tooling/jest-preset/node');

const fake = (name) => path.join(__dirname, 'src', '__tests__', 'fakes', `${name}.ts`);

module.exports = {
  ...preset,
  displayName: 'realtime',
  rootDir: __dirname,
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fakes/', '/__tests__/helpers/'],
  moduleNameMapper: {
    '^@microsoft/signalr$': fake('signalr'),
    '^react-native$': fake('react-native'),
    '^react-native-logs$': fake('react-native-logs'),
    '^expo-constants$': fake('expo-constants'),
    ...preset.moduleNameMapper,
  },
};
