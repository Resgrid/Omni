// iOS purpose strings: the location strings name turn-by-turn navigation only for a variant that has it (Unit).
const path = require('path');

const { createAppConfig } = require('../src/app-config');
const { usage } = require('../src/usage-strings');

const omniRoot = path.resolve(__dirname, '..', '..', '..', 'apps', 'omni');

const locationPlugin = (variant) => {
  const config = createAppConfig({ variant, appEnv: 'production', runNumber: 1, projectRoot: omniRoot, env: {} });
  return config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location')[1];
};

describe('location purpose strings', () => {
  it('mention turn-by-turn navigation only when asked', () => {
    expect(usage.locationWhenInUse('Resgrid Unit', { navigation: true })).toMatch(/turn by turn/);
    expect(usage.locationAlways('Resgrid Unit', { navigation: true })).toMatch(/turn-by-turn navigation/);
    expect(usage.locationWhenInUse('Resgrid Responder')).not.toMatch(/turn/);
    expect(usage.locationAlways('Resgrid Responder', { navigation: false })).not.toMatch(/turn/);
  });

  it('names navigation for Unit (in-app navigation) and not for Responder', () => {
    expect(locationPlugin('unit').locationWhenInUsePermission).toMatch(/^Resgrid Unit uses your location .*turn by turn/);
    expect(locationPlugin('responder').locationWhenInUsePermission).not.toMatch(/turn/);
  });
});
