// Jest preset for pure TypeScript/JavaScript packages (no React Native rendering).
const { moduleNameMapper } = require('./module-map');

module.exports = {
  testEnvironment: 'node',
  transform: { '^.+.(t|j)sx?$': ['babel-jest', { presets: ['babel-preset-expo'], babelrc: false, configFile: false }] },
  moduleNameMapper,
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/*.test.[jt]s?(x)'],
  clearMocks: true,
};
