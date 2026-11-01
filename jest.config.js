// Root Jest config: one project per package so each uses the right preset (node vs React Native).
module.exports = {
  projects: ['<rootDir>/packages/config', '<rootDir>/packages/config-plugins', '<rootDir>/apps/omni'],
  coverageReporters: ['text-summary', 'lcov', 'cobertura'],
};
