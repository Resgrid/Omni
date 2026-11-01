// React hooks: the shared React Native preset (jest-expo) with the same native-module fakes.
const preset = require('../../tooling/jest-preset/react-native');
const fakes = require('./jest.fakes');

module.exports = {
  ...preset,
  displayName: 'voice-hooks',
  rootDir: __dirname,
  moduleNameMapper: { ...fakes, ...preset.moduleNameMapper },
  testMatch: ['<rootDir>/src/hooks/__tests__/**/*.test.[jt]s?(x)'],
};
