const preset = require('../../tooling/jest-preset/node');

module.exports = {
  ...preset,
  displayName: 'omni-app-config',
  rootDir: __dirname,
  testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s'],
  transform: { ...preset.transform, '\\.(wav|mp3)$': '<rootDir>/__tests__/helpers/asset-path-transform.js' },
};
