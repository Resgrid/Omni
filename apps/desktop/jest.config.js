// Jest project for the desktop shell: pure main-process modules, packaging config and the Docker entrypoint.
// Run from the repo root: npx jest --config apps/desktop/jest.config.js
const base = require('../../tooling/jest-preset/node');

module.exports = {
  ...base,
  displayName: 'desktop',
  rootDir: __dirname,
  roots: ['<rootDir>/src', '<rootDir>/packaging', '<rootDir>/scripts', '<rootDir>/__tests__'],
  testPathIgnorePatterns: ['/node_modules/', '/out/', '/release/'],
};
