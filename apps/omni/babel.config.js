module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v5 needs no babel preset: styling is wired through the Metro transform (react-native-css).
    presets: ['babel-preset-expo'],
    plugins: ['babel-plugin-transform-import-meta', 'react-native-worklets/plugin'],
  };
};
