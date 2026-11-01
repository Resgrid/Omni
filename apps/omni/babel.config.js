module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v5 needs no babel preset: styling is wired through the Metro transform (react-native-css).
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
    overrides: [
      {
        // maplibre-gl 6 locates its worker through import.meta.url; rewriting it to require('url') breaks the
        // web bundle, so the import.meta transform skips it. A function, not a RegExp: Metro loads this config
        // without a filename to compute its cache key. Paths use backslashes on Windows.
        test: (filename) => !filename || !/node_modules[\\/]maplibre-gl[\\/]/.test(filename),
        plugins: ['babel-plugin-transform-import-meta'],
      },
    ],
  };
};
