// Maps @resgrid/* imports to package sources so tests never depend on workspace symlinks.
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

module.exports = {
  repoRoot,
  moduleNameMapper: {
    '^@resgrid/config-plugins$': path.join(repoRoot, 'packages/config-plugins/index.js'),
    '^@resgrid/([a-z-]+)$': path.join(repoRoot, 'packages/$1/src/index.ts'),
    '^@resgrid/([a-z-]+)/(.*)$': path.join(repoRoot, 'packages/$1/src/$2'),
  },
};
