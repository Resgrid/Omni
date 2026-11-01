// @resgrid/ui tests: the shared React Native preset plus this package's own mocks (jest.setup.tsx).
const preset = require('../../tooling/jest-preset/react-native');

// gluestack's actionsheet/menu/popover animate with @legendapp/motion, which ships untranspiled ESM.
const transformIgnorePatterns = preset.transformIgnorePatterns.map((pattern) => pattern.replace('|@gluestack-ui|', '|@gluestack-ui|@legendapp/motion|'));

module.exports = {
  ...preset,
  displayName: 'ui',
  rootDir: __dirname,
  // Reanimated 4 / worklets resolve to their non-native builds under Jest.
  resolver: 'react-native-worklets/jest/resolver.js',
  transformIgnorePatterns,
  setupFilesAfterEnv: [...preset.setupFilesAfterEnv, '<rootDir>/jest.setup.tsx'],
};
