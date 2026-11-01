// Services, stores and pure logic: Node preset plus fakes for every native module (react-native included).
const path = require('path');

const preset = require('../../tooling/jest-preset/node');
const fakes = require('./jest.fakes');

module.exports = {
  ...preset,
  displayName: 'voice',
  rootDir: __dirname,
  moduleNameMapper: {
    '^react-native$': path.join(__dirname, 'src', '__tests__', 'fakes', 'react-native.ts'),
    ...fakes,
    ...preset.moduleNameMapper,
  },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/hooks/'],
};
