// Jest preset for pure TypeScript/JavaScript packages (no React Native rendering).
const { moduleNameMapper } = require('./module-map');

module.exports = {
  testEnvironment: 'node',
  // babel-preset-expo keeps `import()` for Metro (code splitting); under Jest it becomes a lazy require().
  transform: { '^.+.(t|j)sx?$': ['babel-jest', { presets: ['babel-preset-expo'], plugins: ['@babel/plugin-transform-dynamic-import'], babelrc: false, configFile: false }] },
  moduleNameMapper,
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/*.test.[jt]s?(x)'],
  clearMocks: true,
};
