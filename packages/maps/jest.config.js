// @resgrid/maps runs two Jest projects: the native renderer + everything platform-neutral (jest.native.config.js) and
// the maplibre-gl web renderer (jest.web.config.js). The root config lists both files as separate projects.
module.exports = {
  projects: [require('./jest.native.config'), require('./jest.web.config')],
};
