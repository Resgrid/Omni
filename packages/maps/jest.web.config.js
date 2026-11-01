// Web / Electron renderer: jest-expo's web preset (react-native-web, jsdom, `.web.*` resolution) with maplibre-gl,
// pmtiles and CSS imports replaced by the stand-ins in src/__tests__/fakes. Runs only `*.web.test.*` files.
const path = require('path');

const { moduleNameMapper } = require('../../tooling/jest-preset/module-map');
const rnPreset = require('../../tooling/jest-preset/react-native');

const fake = (name) => path.join(__dirname, 'src', '__tests__', 'fakes', name);

module.exports = {
  preset: 'jest-expo/web',
  displayName: 'maps-web',
  rootDir: __dirname,
  moduleNameMapper: {
    '^maplibre-gl$': fake('maplibre-gl.ts'),
    '^pmtiles$': fake('pmtiles.ts'),
    '^@resgrid/core$': fake('resgrid-core.ts'),
    '.css$': fake('style-stub.ts'),
    ...moduleNameMapper,
  },
  setupFilesAfterEnv: [...rnPreset.setupFilesAfterEnv, '<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.web.test.[jt]s?(x)'],
  // jest-expo/web's transform passes only a babel `caller`; the repo root has no babel config, so name the preset here.
  transform: {
    '.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'], babelrc: false, configFile: false, caller: { name: 'metro', bundler: 'jest', platform: 'web' } }],
  },
  transformIgnorePatterns: rnPreset.transformIgnorePatterns,
  clearMocks: true,
};
