// @resgrid/ui tests: the shared React Native preset plus this package's own mocks (jest.setup.tsx).
const preset = require('../../tooling/jest-preset/react-native');

// gluestack's actionsheet/menu/popover animate with @legendapp/motion, which ships untranspiled ESM.
const transformIgnorePatterns = preset.transformIgnorePatterns.map((pattern) => pattern.replace('|@gluestack-ui|', '|@gluestack-ui|@legendapp/motion|'));

module.exports = {
  ...preset,
  displayName: 'ui',
  rootDir: __dirname,
  // Reanimated 4.7 / worklets resolve their initialisers to the non-native builds under Jest (Reanimated's resolver wraps
  // the worklets one).
  resolver: 'react-native-reanimated/jest/resolver.js',
  transformIgnorePatterns,
  setupFilesAfterEnv: [...preset.setupFilesAfterEnv, '<rootDir>/jest.setup.tsx'],
};
