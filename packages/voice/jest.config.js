// @resgrid/voice runs two Jest projects: services and stores under the Node preset (native modules
// replaced by the fakes in src/__tests__/fakes), and the React hooks under the React Native preset.
// The root config lists both files (jest.node.config.js, jest.hooks.config.js) as separate projects.
module.exports = {
  projects: [require('./jest.node.config'), require('./jest.hooks.config')],
};
