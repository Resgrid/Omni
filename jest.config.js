// Root Jest config: one project per package so each uses the right preset (node vs React Native).
// Add a package here when it gains a jest.config.js.
module.exports = {
  projects: [
    '<rootDir>/packages/config',
    '<rootDir>/packages/config-plugins',
    '<rootDir>/packages/core',
    '<rootDir>/packages/models',
    '<rootDir>/packages/api',
    '<rootDir>/packages/i18n',
    '<rootDir>/packages/offline',
    '<rootDir>/packages/ui',
    '<rootDir>/apps/omni',
    '<rootDir>/apps/desktop',
  ],
  coverageReporters: ['text-summary', 'lcov', 'cobertura'],
};
