// Native renderer, provider, components and pure logic: the shared React Native preset (jest-expo, iOS platform) with
// @maplibre/maplibre-react-native replaced by the stand-in in src/__tests__/fakes. Web-only tests run in jest.web.config.js.
const path = require('path');

const preset = require('../../tooling/jest-preset/react-native');

const fake = (name) => path.join(__dirname, 'src', '__tests__', 'fakes', name);

module.exports = {
  ...preset,
  displayName: 'maps',
  rootDir: __dirname,
  moduleNameMapper: {
    '^@maplibre/maplibre-react-native$': fake('maplibre-react-native.tsx'),
    '^@resgrid/core$': fake('resgrid-core.ts'),
    ...preset.moduleNameMapper,
  },
  setupFilesAfterEnv: [...preset.setupFilesAfterEnv, '<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fakes/', '.web.test.[jt]sx?$'],
};
