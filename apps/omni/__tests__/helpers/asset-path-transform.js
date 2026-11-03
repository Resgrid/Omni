// Jest transform for the app's audio files: a require()d file becomes its path relative to apps/omni, so a test can
// check which file each sound points at (Metro turns the same require into an asset id).
const path = require('path');

const appRoot = path.resolve(__dirname, '..', '..');

module.exports = {
  process(_source, filename) {
    const relative = path.relative(appRoot, filename).split(path.sep).join('/');
    return { code: `module.exports = ${JSON.stringify(relative)};` };
  },
};
