// @resgrid/notifications tests: the shared node preset plus this package's native-module mocks (jest.setup.ts).
// Hooks render with react-test-renderer, so no React Native renderer (jest-expo) is needed.
const preset = require('../../tooling/jest-preset/node');

module.exports = {
  ...preset,
  displayName: 'notifications',
  rootDir: __dirname,
  setupFiles: ['<rootDir>/jest.setup.ts'],
};
